import { Router } from 'express';
import { HttpError } from '@hhh/server';
import multer from 'multer';
import sharp from 'sharp';
import { join } from 'path';
import { unlink } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { uploadsDir } from '../paths.ts';
import { config } from '../config.ts';
import { validate, schemas, type Body } from '../validation.ts';
import { hashFile } from '../services/hash.ts';
import { extractPhotoMetadata } from '../services/exif.ts';
import { cachedLocation, enqueueGeocode } from '../services/geocodeQueue.ts';
import { generateThumbnail } from '../services/thumbnail.ts';
import { toGeoJSON, toKML } from '../services/exportPhotos.ts';
import { logger } from '../logger.ts';
import { withLock } from '../lock.ts';
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
  setPhotoLocation,
  clearManualLocation,
  batchUpdatePhotos,
  type NewPhoto,
  type Photo,
  type PhotoQuery,
} from '../db.ts';

export const photosRouter = Router();
const router = photosRouter;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
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
    else cb(new HttpError(400, `Unsupported file type: ${file.mimetype}`));
  },
  limits: { fileSize: config.uploadMaxBytes }, // SEC-07: configurable, default 60 MB
});

const duplicate = (photo: Photo | null) => ({
  error: 'duplicate',
  message: 'This photo has already been uploaded',
  photo,
});

// SEC-06: don't trust the client-supplied MIME/extension (multer's fileFilter).
// Decode the bytes with sharp and accept only real raster images — this also
// rejects SVG (script-bearing) and any non-image renamed to look like one.
const ALLOWED_CONTENT_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

async function isSupportedImage(path: string): Promise<boolean> {
  try {
    const meta = await sharp(path).metadata();
    return (
      (meta.width ?? 0) > 0 && meta.format !== undefined && ALLOWED_CONTENT_FORMATS.has(meta.format)
    );
  } catch {
    return false;
  }
}

router.post('/', upload.single('photo'), (req, res) =>
  withLock(async () => {
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
    const gps = meta.lat != null && meta.lng != null ? { lat: meta.lat, lng: meta.lng } : null;
    const cachedName = gps ? cachedLocation(gps.lat, gps.lng) : undefined;
    const locationName = cachedName ?? null;
    const thumbnailFilename = await generateThumbnail(file.path, file.filename);

    const uploadBody = req.body as { projectId?: string } | undefined;
    const record: NewPhoto = {
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
      projectId: uploadBody?.projectId || null,
      focalLengthIn35mm: meta.focalLengthIn35mm,
      panoHFov: meta.panoHFov,
    };

    try {
      insertPhoto(record);
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        await unlink(file.path).catch(() => {});
        if (thumbnailFilename) await unlink(join(uploadsDir, thumbnailFilename)).catch(() => {});
        return res.status(409).json(duplicate(getPhotoByHash(fileHash)));
      }
      throw err;
    }

    // Resolve the location in the background (rate-limited, cached) when it wasn't
    // already cached. Fire-and-forget — the upload response is not blocked on it.
    if (gps && cachedName === undefined) {
      void enqueueGeocode(record.id, gps.lat, gps.lng);
    }

    res.status(201).json({ ...record, hasGps: !!record.hasGps, tags: [], description: null });
  })
);

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
  // Every filter is a single string. (A repeated key arrives as an array; that
  // case is handled when the routes move to the shared kit's validation.)
  const q = req.query as Record<string, string | undefined>;
  if (!FILTER_KEYS.some((k) => q[k] !== undefined)) {
    return res.json(getAllPhotos());
  }

  const opts: PhotoQuery = {};
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
    if (
      west !== undefined &&
      south !== undefined &&
      east !== undefined &&
      north !== undefined &&
      [west, south, east, north].every(Number.isFinite)
    )
      opts.bbox = { west, south, east, north };
  }

  let limit: number | null = null;
  let offset = 0;
  if (q.limit !== undefined) {
    limit = Math.min(Math.max(parseInt(q.limit, 10) || 0, 0), 500); // cap page size
    offset = Math.max(parseInt(q.offset ?? '', 10) || 0, 0);
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
  const { id } = req.params as { id: string };
  const photo = getPhotoFullById(id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  res.json(photo);
});

router.patch('/batch', validate(schemas.batchUpdatePhotos), (req, res) => {
  const { ids, tags, description, mergeTags } = req.body as Body<'batchUpdatePhotos'>;
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
    .filter((u) => u !== null);
  batchUpdatePhotos(updates);
  res.json({ updated: updates.length });
});

router.patch('/:id', validate(schemas.updatePhoto), (req, res) => {
  const { id } = req.params as { id: string };
  const photo = getPhotoById(id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  const { description, tags, projectId, surveyDate } = req.body as Body<'updatePhoto'>;
  if (description !== undefined || tags !== undefined) updatePhoto(id, { description, tags });
  if (projectId !== undefined) updatePhotoProject(id, projectId);
  if (surveyDate !== undefined) updatePhotoSurveyDate(id, surveyDate);
  res.json(getPhotoFullById(id));
});

// FEAT: manually place a GPS-less photo (or reposition a hand-placed pin). A
// two-segment path, so it never collides with the single-segment PATCH/DELETE
// `/:id` routes above.
router.put('/:id/location', validate(schemas.setPhotoLocation), (req, res) => {
  const { id } = req.params as { id: string };
  const photo = getPhotoById(id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  const { lat, lng } = req.body as Body<'setPhotoLocation'>;
  setPhotoLocation(id, lat, lng);
  res.json(getPhotoFullById(id));
});

// FEAT: remove a hand-placed location, returning the photo to "No GPS". Refuses
// (409) if the photo has no manual location — real EXIF fixes can't be cleared.
router.delete('/:id/location', (req, res) => {
  const { id } = req.params as { id: string };
  const photo = getPhotoById(id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  const changed = clearManualLocation(id);
  if (!changed)
    return res.status(409).json({ error: 'Photo has no manually-set location to clear' });
  res.json(getPhotoFullById(id));
});

router.delete('/:id', (req, res) =>
  withLock(async () => {
    const { id } = req.params as { id: string };
    const photo = getPhotoById(id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    deletePhoto(photo.id);

    try {
      await unlink(join(uploadsDir, photo.filename));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        logger.error({ err }, 'File delete failed');
    }
    if (photo.thumbnailFilename) {
      try {
        await unlink(join(uploadsDir, photo.thumbnailFilename));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
          logger.error({ err }, 'Thumbnail delete failed');
      }
    }

    res.json({ id: photo.id });
  })
);
