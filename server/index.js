import express from 'express';
// BE-01: patches Express 4 so errors thrown/rejected in async route handlers are
// forwarded to the error middleware instead of hanging the request. Must be
// imported before routes are defined.
import 'express-async-errors';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { validate, schemas } from './validation.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, createReadStream, readdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import exifr from 'exifr';
import sharp from 'sharp';
import {
  insertPhoto,
  getAllPhotos,
  getPhotoById,
  deletePhoto,
  getPhotoByHash,
  updatePhoto,
  updatePhotoSurveyDate,
  updatePhotoProject,
  batchUpdatePhotos,
  createProject,
  getAllProjects,
  updateProject,
  deleteProject,
  assignPhotosToProject,
  createClient,
  getAllClients,
  updateClient,
  deleteClient,
  resetAll,
} from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(__dirname, 'uploads');
mkdirSync(uploadsDir, { recursive: true });

const app = express();

// SEC-09: security headers + CSP. The CSP allowlists the map tile hosts and the
// client-side Nominatim search; 'unsafe-inline' styles are permitted because
// Leaflet/markercluster inject inline styles (script stays 'self' only).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://server.arcgisonline.com',
          'https://*.tile.openstreetmap.org',
          'https://*.basemaps.cartocdn.com',
          'https://*.tile.opentopomap.org',
        ],
        connectSrc: ["'self'", 'https://nominatim.openstreetmap.org'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        // Leave to HSTS + the proxy's HTTP->HTTPS redirect (ADR-0007). Setting it
        // here would break direct HTTP access (health checks, local runs).
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// PERF-08: gzip/brotli responses.
app.use(compression());

// SEC-04: no cross-origin access by default (app is same-origin behind the
// proxy). Enable only for explicitly configured origins.
if (config.allowedOrigins.length > 0) {
  app.use(cors({ origin: config.allowedOrigins }));
}

app.use(express.json());

// SEC-07: per-IP rate limit on the API surface.
app.use(
  '/api',
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp']);

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/webp': '.webp',
  'image/tiff': '.tiff',
};

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
  limits: { fileSize: config.uploadMaxBytes }, // SEC-07: configurable, default 60 MB
});

app.post('/api/photos', upload.single('photo'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileHash = await hashFile(file.path);
  const existingByHash = getPhotoByHash(fileHash);
  if (existingByHash) {
    await unlink(file.path);
    return res
      .status(409)
      .json({
        error: 'duplicate',
        message: 'This photo has already been uploaded',
        photo: existingByHash,
      });
  }

  let exif = {};
  try {
    exif =
      (await exifr.parse(file.path, {
        gps: true,
        ifd0: true,
        exif: true,
        xmp: true,
      })) || {};
  } catch {
    // EXIF parse failure is non-fatal
  }

  let panoHFov = null;
  if (exif.GPano?.FullPanoWidthPixels && exif.GPano?.CroppedAreaImageWidthPixels) {
    panoHFov = (exif.GPano.CroppedAreaImageWidthPixels / exif.GPano.FullPanoWidthPixels) * 360;
  }

  const hasGps = exif.latitude != null && exif.longitude != null;

  let locationName = null;
  if (hasGps) {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${exif.latitude}&lon=${exif.longitude}`,
        { headers: { 'User-Agent': 'fuzzy-guide/1.0' } }
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const addr = geoData.address || {};
        const parts = [
          addr.city || addr.town || addr.village || addr.county,
          addr.state || addr.country,
        ].filter(Boolean);
        locationName = parts.slice(0, 2).join(', ') || geoData.display_name?.split(',')[0] || null;
      }
    } catch {
      // Reverse geocode failure is non-fatal
    }
  }

  let exposureTime = null;
  if (exif.ExposureTime != null) {
    const et = exif.ExposureTime;
    exposureTime = et < 1 ? `1/${Math.round(1 / et)}s` : `${et}s`;
  }

  let dateTaken = null;
  if (exif.DateTimeOriginal) {
    dateTaken =
      exif.DateTimeOriginal instanceof Date
        ? exif.DateTimeOriginal.toISOString()
        : String(exif.DateTimeOriginal);
  }

  const thumbFilename = `thumb_${file.filename.replace(/\.[^.]+$/, '.jpg')}`;
  let thumbnailFilename = null;
  try {
    await sharp(file.path)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(join(uploadsDir, thumbFilename));
    thumbnailFilename = thumbFilename;
  } catch {
    // Thumbnail generation failure is non-fatal
  }

  const projectId = req.body?.projectId || null;
  const surveyDate = dateTaken ? dateTaken.slice(0, 10) : null;

  const record = {
    id: uuidv4(),
    filename: file.filename,
    thumbnailFilename,
    originalName: file.originalname,
    uploadedAt: new Date().toISOString(),
    hasGps: hasGps ? 1 : 0,
    lat: exif.latitude ?? null,
    lng: exif.longitude ?? null,
    altitude: exif.GPSAltitude ?? null,
    imgDirection: exif.GPSImgDirection ?? null,
    dateTaken,
    surveyDate,
    cameraMake: exif.Make ?? null,
    cameraModel: exif.Model ?? null,
    focalLength: exif.FocalLength ?? null,
    fNumber: exif.FNumber ?? null,
    iso: exif.ISO ?? null,
    exposureTime,
    fileHash,
    locationName,
    projectId,
    focalLengthIn35mm: exif.FocalLengthIn35mmFormat ?? null,
    panoHFov,
  };

  try {
    insertPhoto(record);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      await unlink(file.path).catch(() => {});
      if (thumbnailFilename) await unlink(join(uploadsDir, thumbnailFilename)).catch(() => {});
      const existing = getPhotoByHash(fileHash);
      return res
        .status(409)
        .json({
          error: 'duplicate',
          message: 'This photo has already been uploaded',
          photo: existing,
        });
    }
    throw err;
  }

  res.status(201).json({
    ...record,
    hasGps: !!record.hasGps,
    tags: [],
    description: null,
  });
});

app.get('/api/photos', (_req, res) => {
  res.json(getAllPhotos());
});

app.get('/api/photos/export', (req, res) => {
  const { format: formatParam } = req.query;
  const format = formatParam === 'kml' ? 'kml' : 'geojson';
  const photos = getAllPhotos().filter((p) => p.hasGps && p.lat != null && p.lng != null);

  if (format === 'geojson') {
    const fc = {
      type: 'FeatureCollection',
      features: photos.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat, p.altitude ?? 0] },
        properties: {
          id: p.id,
          name: p.originalName,
          dateTaken: p.dateTaken,
          uploadedAt: p.uploadedAt,
          cameraMake: p.cameraMake,
          cameraModel: p.cameraModel,
          focalLength: p.focalLength,
          fNumber: p.fNumber,
          iso: p.iso,
          exposureTime: p.exposureTime,
          altitude: p.altitude,
          imgDirection: p.imgDirection,
          locationName: p.locationName,
          description: p.description,
          tags: p.tags,
        },
      })),
    };
    res.setHeader('Content-Disposition', 'attachment; filename="photos.geojson"');
    res.setHeader('Content-Type', 'application/geo+json');
    return res.json(fc);
  }

  // KML
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const placemarks = photos
    .map((p) => {
      const extData = [
        p.dateTaken && `<Data name="dateTaken"><value>${esc(p.dateTaken)}</value></Data>`,
        p.cameraMake &&
          `<Data name="camera"><value>${esc([p.cameraMake, p.cameraModel].filter(Boolean).join(' '))}</value></Data>`,
        p.altitude != null && `<Data name="altitude"><value>${p.altitude}m</value></Data>`,
        p.locationName && `<Data name="location"><value>${esc(p.locationName)}</value></Data>`,
        p.description && `<Data name="description"><value>${esc(p.description)}</value></Data>`,
        p.tags?.length && `<Data name="tags"><value>${esc(p.tags.join(', '))}</value></Data>`,
      ]
        .filter(Boolean)
        .join('\n      ');
      return `  <Placemark>
    <name>${esc(p.originalName)}</name>
    <ExtendedData>${extData ? `\n      ${extData}\n    ` : ''}</ExtendedData>
    <Point><coordinates>${p.lng},${p.lat},${p.altitude ?? 0}</coordinates></Point>
  </Placemark>`;
    })
    .join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Photo Locations</name>
${placemarks}
</Document>
</kml>`;

  res.setHeader('Content-Disposition', 'attachment; filename="photos.kml"');
  res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
  res.send(kml);
});

app.patch('/api/photos/batch', validate(schemas.batchUpdatePhotos), (req, res) => {
  const { ids, tags, description, mergeTags } = req.body;
  const allPhotos = getAllPhotos();
  const updates = ids
    .map((id) => {
      const existing = allPhotos.find((p) => p.id === id);
      if (!existing) return null;
      let finalTags = tags !== undefined ? tags : existing.tags;
      if (mergeTags && tags) {
        finalTags = [...new Set([...existing.tags, ...tags])];
      }
      return {
        id,
        description: description !== undefined ? description : undefined,
        tags: finalTags,
      };
    })
    .filter(Boolean);
  batchUpdatePhotos(updates);
  res.json({ updated: updates.length });
});

app.patch('/api/photos/:id', validate(schemas.updatePhoto), (req, res) => {
  const photo = getPhotoById(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  const { description, tags, projectId, surveyDate } = req.body;
  if (description !== undefined || tags !== undefined) {
    updatePhoto(req.params.id, { description, tags });
  }
  if (projectId !== undefined) {
    updatePhotoProject(req.params.id, projectId);
  }
  if (surveyDate !== undefined) {
    updatePhotoSurveyDate(req.params.id, surveyDate);
  }
  const updated = getAllPhotos().find((p) => p.id === req.params.id);
  res.json(updated);
});

app.get('/api/photos/check-hash', (req, res) => {
  const { hash } = req.query;
  if (!hash) return res.status(400).json({ error: 'hash required' });
  const existing = getPhotoByHash(hash);
  if (existing) return res.json({ duplicate: true, photo: existing });
  res.status(404).json({ duplicate: false });
});

app.delete('/api/photos/:id', async (req, res) => {
  const photo = getPhotoById(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  deletePhoto(photo.id);

  try {
    await unlink(join(uploadsDir, photo.filename));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('File delete failed:', err);
  }

  if (photo.thumbnailFilename) {
    try {
      await unlink(join(uploadsDir, photo.thumbnailFilename));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Thumbnail delete failed:', err);
    }
  }

  res.json({ id: photo.id });
});

// Clients
app.get('/api/clients', (_req, res) => {
  res.json(getAllClients());
});

app.post('/api/clients', validate(schemas.createClient), (req, res) => {
  const { name } = req.body; // validated + trimmed
  const client = {
    id: uuidv4(),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    createClient(client);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A client with that name already exists' });
    }
    throw err;
  }
  res.status(201).json({ ...client, projectCount: 0 });
});

app.patch('/api/clients/:id', validate(schemas.updateClient), (req, res) => {
  // BE-04: 404 on missing client, 409 on duplicate name (name validated by schema).
  const { name } = req.body;
  let changed;
  try {
    changed = updateClient(req.params.id, { name, updatedAt: new Date().toISOString() });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A client with that name already exists' });
    }
    throw err;
  }
  if (!changed) return res.status(404).json({ error: 'Client not found' });
  res.json(getAllClients().find((c) => c.id === req.params.id));
});

app.delete('/api/clients/:id', (req, res) => {
  const changes = deleteClient(req.params.id);
  if (!changes) return res.status(404).json({ error: 'not found' });
  res.json({ id: req.params.id });
});

// Projects
app.get('/api/projects', (_req, res) => {
  res.json(getAllProjects());
});

app.post('/api/projects', validate(schemas.createProject), (req, res) => {
  const { name, clientId, status, color } = req.body; // name validated + trimmed
  const project = {
    id: uuidv4(),
    name,
    clientId: clientId || null,
    status: status || 'active',
    color: color || '#e97b25',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  createProject(project);
  res.status(201).json({ ...project, photoCount: 0, clientName: null });
});

app.patch('/api/projects/:id', validate(schemas.updateProject), (req, res) => {
  // BE-03: forward only keys the caller sent (schema strips absent ones), so an
  // explicit `clientId: null` unassigns the client. name is validated by schema.
  const changes = {};
  for (const k of ['name', 'clientId', 'status', 'color']) {
    if (k in req.body) changes[k] = req.body[k];
  }
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'no updatable fields provided' });
  }
  const changed = updateProject(req.params.id, changes);
  if (!changed) return res.status(404).json({ error: 'Project not found' });
  res.json(getAllProjects().find((p) => p.id === req.params.id));
});

app.delete('/api/projects/:id', (req, res) => {
  const changes = deleteProject(req.params.id);
  if (!changes) return res.status(404).json({ error: 'not found' });
  res.json({ id: req.params.id });
});

app.patch('/api/projects/:id/photos', validate(schemas.assignPhotos), (req, res) => {
  const { photoIds } = req.body;
  assignPhotosToProject(req.params.id, photoIds);
  res.json({ assigned: photoIds.length });
});

app.use('/uploads', express.static(uploadsDir));

// BE-01 regression hook: a route that rejects asynchronously, used only by the
// test suite to assert async errors reach the error handler (500, not a hang).
// Registered before the error middleware so the error can propagate to it.
if (process.env.NODE_ENV === 'test') {
  app.get('/__test/async-error', async () => {
    await Promise.resolve();
    throw new Error('async boom');
  });
}

app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  // SEC-08: don't leak internal error detail to clients in production. Client
  // (4xx) errors keep their message; server (5xx) errors are masked in prod.
  const message =
    status < 500 || !config.isProd
      ? err.message || 'Internal server error'
      : 'Internal server error';
  res.status(status).json({ error: message });
});

// Serve built frontend in production
const distDir = join(__dirname, '..', 'dist');
app.use(express.static(distDir));
// SEC-02: destructive full wipe. Disabled unless explicitly enabled via env, as
// defense-in-depth behind the reverse-proxy auth (ADR-0007) — a total-data-loss
// endpoint should not be trivially reachable even by an authenticated browser.
app.delete('/api/reset', async (_req, res) => {
  if (!config.allowReset) {
    return res.status(403).json({ error: 'Reset is disabled. Set ALLOW_RESET=true to enable it.' });
  }
  resetAll();
  const files = readdirSync(uploadsDir);
  await Promise.all(files.map((f) => unlink(join(uploadsDir, f)).catch(() => {})));
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

// Don't bind a port under test — supertest drives the app object directly.
if (!config.isTest) {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}

export { app };
