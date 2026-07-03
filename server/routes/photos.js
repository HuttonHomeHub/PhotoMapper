import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { join } from 'path';
import { unlink } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { uploadsDir } from '../paths.js';
import { config } from '../config.js';
import { validate, schemas } from '../validation.js';
import { hashFile } from '../services/hash.js';
import { extractPhotoMetadata } from '../services/exif.js';
import { cachedLocation, enqueueGeocode } from '../services/geocodeQueue.js';
import { generateThumbnail } from '../services/thumbnail.js';
import { toGeoJSON, toKML } from '../services/exportPhotos.js';
import { logger } from '../logger.js';
import {
  insertPhoto,
  getAllPhotos,
  queryPhotos,
  countPhotos,
  getPhotoById,
  getPhotoFullById,
  deletePhoto,
  getPhotoByHash,
  updatePhoto,
  updatePhotoSurveyDate,
  updatePhotoProject,
  batchUpdatePhotos,
} from '../db.js';

const router = Router();

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp']);
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
  filename: (_req, file, cb) => cb(null, uuidv4() + (MIME_TO_EXT[file.mimetype] || '.jpg')),
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
  limits: { fileSize: config.uploadMaxBytes }, // SEC-07: configurable, default 60 MB
});

const duplicate = (photo) => ({
  error: 'duplicate',
  message: 'This photo has already been uploaded',
  photo,
});

// SEC-06: don't trust the client-supplied MIME/extension (multer's fileFilter).
// Decode the bytes with sharp and accept only real raster images — this also
// rejects SVG (script-bearing) and any non-image renamed to look like one.
const ALLOWED_CONTENT_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

async function isSupportedImage(path) {
  try {
    const meta = await sharp(path).metadata();
    return !!meta && meta.width > 0 && ALLOWED_CONTENT_FORMATS.has(meta.format);
  } catch {
    return false;
  }
}

router.post('/', upload.single('photo'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  // SEC-06: verify actual content before storing anything.
  if (!(await isSupportedImage(file.path))) {
    await unlink(file.path).catch(() => {});
    return res.status(400).json({ error: 'Uploaded file is not a supported image' });
  }

  const fileHash = await hashFile(file.path);
  const existingByHash = getPhotoByHash(fileHash);
  if (existingByHash) {
    await unlink(file.path);
    return res.status(409).json(duplicate(existingByHash));
  }

  const meta = await extractPhotoMetadata(file.path);
  // BE-07/SEC-05: use the geocode cache synchronously if available; otherwise the
  // photo is saved without a location and it's resolved in the background below.
  const cachedName = meta.hasGps ? cachedLocation(meta.lat, meta.lng) : undefined;
  const locationName = cachedName ?? null;
  const thumbnailFilename = await generateThumbnail(file.path, file.filename);

  const record = {
    id: uuidv4(),
    filename: file.filename,
    thumbnailFilename,
    originalName: file.originalname,
    uploadedAt: new Date().toISOString(),
    hasGps: meta.hasGps ? 1 : 0,
    lat: meta.lat,
    lng: meta.lng,
    altitude: meta.altitude,
    imgDirection: meta.imgDirection,
    dateTaken: meta.dateTaken,
    surveyDate: meta.dateTaken ? meta.dateTaken.slice(0, 10) : null,
    cameraMake: meta.cameraMake,
    cameraModel: meta.cameraModel,
    focalLength: meta.focalLength,
    fNumber: meta.fNumber,
    iso: meta.iso,
    exposureTime: meta.exposureTime,
    fileHash,
    locationName,
    projectId: req.body?.projectId || null,
    focalLengthIn35mm: meta.focalLengthIn35mm,
    panoHFov: meta.panoHFov,
  };

  try {
    insertPhoto(record);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      await unlink(file.path).catch(() => {});
      if (thumbnailFilename) await unlink(join(uploadsDir, thumbnailFilename)).catch(() => {});
      return res.status(409).json(duplicate(getPhotoByHash(fileHash)));
    }
    throw err;
  }

  // Resolve the location in the background (rate-limited, cached) when it wasn't
  // already cached. Fire-and-forget — the upload response is not blocked on it.
  if (meta.hasGps && cachedName === undefined) {
    enqueueGeocode(record.id, meta.lat, meta.lng);
  }

  res.status(201).json({ ...record, hasGps: !!record.hasGps, tags: [], description: null });
});

// PERF-01 (ADR-0010): filtered + paginated listing. With NO query params this
// returns the legacy bare array (back-compat during the phased frontend
// migration); with any filter/paging param it returns { items, total, limit,
// offset }. Draw-region polygon filtering stays client-side (not SQL-expressible).
const FILTER_KEYS = [
  'limit',
  'offset',
  'projectId',
  'clientId',
  'surveyDate',
  'tag',
  'search',
  'hasGps',
  'from',
  'to',
  'bbox',
];

router.get('/', (req, res) => {
  const q = req.query;
  if (!FILTER_KEYS.some((k) => q[k] !== undefined)) {
    return res.json(getAllPhotos());
  }

  const opts = {};
  if (q.projectId !== undefined) opts.projectId = q.projectId === 'none' ? null : q.projectId;
  if (q.clientId !== undefined) opts.clientId = q.clientId === 'none' ? null : q.clientId;
  if (q.surveyDate !== undefined)
    opts.surveyDate = q.surveyDate === 'undated' ? null : q.surveyDate;
  if (q.tag !== undefined) opts.tag = q.tag;
  if (q.search !== undefined) opts.search = q.search;
  if (q.hasGps === 'true') opts.hasGps = true;
  if (q.from) opts.from = q.from;
  if (q.to) opts.to = q.to;
  if (q.bbox !== undefined) {
    const [west, south, east, north] = String(q.bbox).split(',').map(Number);
    if ([west, south, east, north].every(Number.isFinite)) opts.bbox = { west, south, east, north };
  }

  let limit = null;
  let offset = 0;
  if (q.limit !== undefined) {
    limit = Math.min(Math.max(parseInt(q.limit, 10) || 0, 0), 500); // cap page size
    offset = Math.max(parseInt(q.offset, 10) || 0, 0);
    opts.limit = limit;
    opts.offset = offset;
  }

  res.json({ items: queryPhotos(opts), total: countPhotos(opts), limit, offset });
});

router.get('/export', (req, res) => {
  const format = req.query.format === 'kml' ? 'kml' : 'geojson';
  const photos = getAllPhotos().filter((p) => p.hasGps && p.lat != null && p.lng != null);

  if (format === 'geojson') {
    res.setHeader('Content-Disposition', 'attachment; filename="photos.geojson"');
    res.setHeader('Content-Type', 'application/geo+json');
    return res.json(toGeoJSON(photos));
  }

  res.setHeader('Content-Disposition', 'attachment; filename="photos.kml"');
  res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
  res.send(toKML(photos));
});

// PERF-01/A: single-photo detail. A proper REST resource for the lightbox/detail
// view and deep-linking. Declared after /export so ":id" doesn't capture it.
router.get('/:id', (req, res) => {
  const photo = getPhotoFullById(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  res.json(photo);
});

router.patch('/batch', validate(schemas.batchUpdatePhotos), (req, res) => {
  const { ids, tags, description, mergeTags } = req.body;
  const allPhotos = getAllPhotos();
  const updates = ids
    .map((id) => {
      const existing = allPhotos.find((p) => p.id === id);
      if (!existing) return null;
      let finalTags = tags !== undefined ? tags : existing.tags;
      if (mergeTags && tags) finalTags = [...new Set([...existing.tags, ...tags])];
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

router.patch('/:id', validate(schemas.updatePhoto), (req, res) => {
  const photo = getPhotoById(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  const { description, tags, projectId, surveyDate } = req.body;
  if (description !== undefined || tags !== undefined)
    updatePhoto(req.params.id, { description, tags });
  if (projectId !== undefined) updatePhotoProject(req.params.id, projectId);
  if (surveyDate !== undefined) updatePhotoSurveyDate(req.params.id, surveyDate);
  res.json(getPhotoFullById(req.params.id));
});

router.delete('/:id', async (req, res) => {
  const photo = getPhotoById(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  deletePhoto(photo.id);

  try {
    await unlink(join(uploadsDir, photo.filename));
  } catch (err) {
    if (err.code !== 'ENOENT') logger.error({ err }, 'File delete failed');
  }
  if (photo.thumbnailFilename) {
    try {
      await unlink(join(uploadsDir, photo.thumbnailFilename));
    } catch (err) {
      if (err.code !== 'ENOENT') logger.error({ err }, 'Thumbnail delete failed');
    }
  }

  res.json({ id: photo.id });
});

export default router;
