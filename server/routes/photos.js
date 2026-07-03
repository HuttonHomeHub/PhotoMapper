import { Router } from 'express';
import multer from 'multer';
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

router.post('/', upload.single('photo'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

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

router.get('/', (_req, res) => res.json(getAllPhotos()));

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

router.get('/check-hash', (req, res) => {
  const { hash } = req.query;
  if (!hash) return res.status(400).json({ error: 'hash required' });
  const existing = getPhotoByHash(hash);
  if (existing) return res.json({ duplicate: true, photo: existing });
  res.status(404).json({ duplicate: false });
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
  res.json(getAllPhotos().find((p) => p.id === req.params.id));
});

router.delete('/:id', async (req, res) => {
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

export default router;
