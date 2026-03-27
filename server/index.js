import express from 'express'
import multer from 'multer'
import cors from 'cors'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, createReadStream } from 'fs'
import { unlink } from 'fs/promises'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import exifr from 'exifr'
import sharp from 'sharp'
import { insertPhoto, getAllPhotos, getPhotoById, deletePhoto, getPhotoByHash } from './db.js'

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

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.jpg'
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

  const fileHash = await hashFile(file.path)
  const existingByHash = getPhotoByHash(fileHash)
  if (existingByHash) {
    await unlink(file.path)
    return res.status(409).json({ error: 'duplicate', message: 'This photo has already been uploaded', photo: existingByHash })
  }

  let exif = {}
  try {
    exif = await exifr.parse(file.path, {
      gps: true,
      ifd0: true,
      exif: true
    }) || {}
  } catch {
    // EXIF parse failure is non-fatal
  }

  const hasGps = exif.latitude != null && exif.longitude != null

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
    fileHash
  }

  try {
    insertPhoto(record)
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      await unlink(file.path)
      if (thumbnailFilename) await unlink(join(uploadsDir, thumbnailFilename)).catch(() => {})
      const existing = getPhotoByHash(fileHash)
      return res.status(409).json({ error: 'duplicate', message: 'This photo has already been uploaded', photo: existing })
    }
    throw err
  }

  res.status(201).json({
    ...record,
    hasGps: !!record.hasGps
  })
})

app.get('/api/photos', (_req, res) => {
  res.json(getAllPhotos())
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

  if (photo.thumbnail_filename) {
    try {
      await unlink(join(uploadsDir, photo.thumbnail_filename))
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Thumbnail delete failed:', err)
    }
  }

  res.json({ id: photo.id })
})

app.use('/uploads', express.static(uploadsDir))

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
