import express from 'express'
import multer from 'multer'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, createReadStream } from 'fs'
import { unlink } from 'fs/promises'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import exifr from 'exifr'
import sharp from 'sharp'
import { insertPhoto, getAllPhotos, getPhotoById, deletePhoto, getPhotoByHash, updatePhoto } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uploadsDir = join(__dirname, 'uploads')
mkdirSync(uploadsDir, { recursive: true })

const app = express()
app.use(cors())
app.use(express.json())

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp'])

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/webp': '.webp',
  'image/tiff': '.tiff',
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '.jpg'
    cb(null, uuidv4() + ext)
  }
})

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`))
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
})

app.post('/api/photos', upload.single('photo'), async (req, res) => {
  const file = req.file
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  let exif = {}
  let fileHash
  try {
    fileHash = await hashFile(file.path)
    const existingByHash = getPhotoByHash(fileHash)
    if (existingByHash) {
      await unlink(file.path)
      return res.status(409).json({ error: 'duplicate', message: 'This photo has already been uploaded', photo: existingByHash })
    }
    exif = await exifr.parse(file.path, {
      gps: true,
      ifd0: true,
      exif: true
    }) || {}
  } catch {
    // EXIF parse failure is non-fatal
  }

  const hasGps = exif.latitude != null && exif.longitude != null

  let locationName = null
  if (hasGps) {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${exif.latitude}&lon=${exif.longitude}`,
        { headers: { 'User-Agent': 'fuzzy-guide/1.0' } }
      )
      if (geoRes.ok) {
        const geoData = await geoRes.json()
        const addr = geoData.address || {}
        const parts = [
          addr.city || addr.town || addr.village || addr.county,
          addr.state || addr.country
        ].filter(Boolean)
        locationName = parts.slice(0, 2).join(', ') || geoData.display_name?.split(',')[0] || null
      }
    } catch {
      // Reverse geocode failure is non-fatal
    }
  }

  let exposureTime = null
  if (exif.ExposureTime != null) {
    const et = exif.ExposureTime
    exposureTime = et < 1 ? `1/${Math.round(1 / et)}s` : `${et}s`
  }

  let dateTaken = null
  if (exif.DateTimeOriginal) {
    dateTaken = exif.DateTimeOriginal instanceof Date
      ? exif.DateTimeOriginal.toISOString()
      : String(exif.DateTimeOriginal)
  }

  const thumbFilename = `thumb_${file.filename.replace(/\.[^.]+$/, '.jpg')}`
  let thumbnailFilename = null
  try {
    await sharp(file.path)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(join(uploadsDir, thumbFilename))
    thumbnailFilename = thumbFilename
  } catch {
    // Thumbnail generation failure is non-fatal
  }

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
    cameraMake: exif.Make ?? null,
    cameraModel: exif.Model ?? null,
    focalLength: exif.FocalLength ?? null,
    fNumber: exif.FNumber ?? null,
    iso: exif.ISO ?? null,
    exposureTime,
    fileHash,
    locationName
  }

  try {
    insertPhoto(record)
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      await unlink(file.path).catch(() => {})
      if (thumbnailFilename) await unlink(join(uploadsDir, thumbnailFilename)).catch(() => {})
      const existing = getPhotoByHash(fileHash)
      return res.status(409).json({ error: 'duplicate', message: 'This photo has already been uploaded', photo: existing })
    }
    throw err
  }

  res.status(201).json({
    ...record,
    hasGps: !!record.hasGps,
    tags: [],
    description: null
  })
})

app.get('/api/photos', (_req, res) => {
  res.json(getAllPhotos())
})

app.get('/api/photos/export', (req, res) => {
  const format = req.query.format === 'kml' ? 'kml' : 'geojson'
  const photos = getAllPhotos().filter(p => p.hasGps && p.lat != null && p.lng != null)

  if (format === 'geojson') {
    const fc = {
      type: 'FeatureCollection',
      features: photos.map(p => ({
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
          tags: p.tags
        }
      }))
    }
    res.setHeader('Content-Disposition', 'attachment; filename="photos.geojson"')
    res.setHeader('Content-Type', 'application/geo+json')
    return res.json(fc)
  }

  // KML
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const placemarks = photos.map(p => {
    const extData = [
      p.dateTaken && `<Data name="dateTaken"><value>${esc(p.dateTaken)}</value></Data>`,
      p.cameraMake && `<Data name="camera"><value>${esc([p.cameraMake, p.cameraModel].filter(Boolean).join(' '))}</value></Data>`,
      p.altitude != null && `<Data name="altitude"><value>${p.altitude}m</value></Data>`,
      p.locationName && `<Data name="location"><value>${esc(p.locationName)}</value></Data>`,
      p.description && `<Data name="description"><value>${esc(p.description)}</value></Data>`,
      p.tags?.length && `<Data name="tags"><value>${esc(p.tags.join(', '))}</value></Data>`
    ].filter(Boolean).join('\n      ')
    return `  <Placemark>
    <name>${esc(p.originalName)}</name>
    <ExtendedData>${extData ? `\n      ${extData}\n    ` : ''}</ExtendedData>
    <Point><coordinates>${p.lng},${p.lat},${p.altitude ?? 0}</coordinates></Point>
  </Placemark>`
  }).join('\n')

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Photo Locations</name>
${placemarks}
</Document>
</kml>`

  res.setHeader('Content-Disposition', 'attachment; filename="photos.kml"')
  res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml')
  res.send(kml)
})

app.patch('/api/photos/:id', (req, res) => {
  const photo = getPhotoById(req.params.id)
  if (!photo) return res.status(404).json({ error: 'Photo not found' })
  const { description, tags } = req.body
  updatePhoto(req.params.id, { description, tags })
  const updated = getAllPhotos().find(p => p.id === req.params.id)
  res.json(updated)
})

app.get('/api/photos/check-hash', (req, res) => {
  const { hash } = req.query
  if (!hash) return res.status(400).json({ error: 'hash required' })
  const existing = getPhotoByHash(hash)
  if (existing) return res.json({ duplicate: true, photo: existing })
  res.status(404).json({ duplicate: false })
})

app.delete('/api/photos/:id', async (req, res) => {
  const photo = getPhotoById(req.params.id)
  if (!photo) return res.status(404).json({ error: 'Photo not found' })

  deletePhoto(photo.id)

  try {
    await unlink(join(uploadsDir, photo.filename))
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('File delete failed:', err)
  }

  if (photo.thumbnailFilename) {
    try {
      await unlink(join(uploadsDir, photo.thumbnailFilename))
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Thumbnail delete failed:', err)
    }
  }

  res.json({ id: photo.id })
})

app.use('/uploads', express.static(uploadsDir))

app.use((err, req, res, _next) => {
  console.error(err)
  const status = err.status || err.statusCode || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
})

// Serve built frontend in production
const distDir = join(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.get('*', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
