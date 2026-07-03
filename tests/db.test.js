import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'

// TEST-01 seed suite: exercises the SQLite data layer against a throwaway DB.
// This is the most defect-prone code in the repo (hand-written camelCase <->
// snake_case mappers), so it is the highest-value first target.

let dbmod
let tmpDir

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'photomapper-db-'))
  process.env.PHOTOS_DB_PATH = join(tmpDir, 'test.db')
  // db.js opens the database at import time, so the env var must be set first.
  dbmod = await import('../server/db.js')
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function makePhoto(overrides = {}) {
  return {
    id: overrides.id ?? 'photo-1',
    filename: 'abc.jpg',
    thumbnailFilename: 'thumb_abc.jpg',
    originalName: 'Original Name.jpg',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    hasGps: 1,
    lat: 51.5,
    lng: -0.12,
    altitude: 42,
    imgDirection: 180,
    dateTaken: '2026-01-01T12:00:00.000Z',
    surveyDate: '2026-01-01',
    cameraMake: 'Canon',
    cameraModel: 'EOS',
    focalLength: 35,
    fNumber: 2.8,
    iso: 100,
    exposureTime: '1/200s',
    fileHash: 'hash-1',
    locationName: 'London, UK',
    projectId: null,
    focalLengthIn35mm: 50,
    panoHFov: null,
    ...overrides,
  }
}

describe('photos data layer', () => {
  it('inserts and maps a row to camelCase with a boolean hasGps', () => {
    dbmod.insertPhoto(makePhoto())
    const all = dbmod.getAllPhotos()
    const row = all.find(p => p.id === 'photo-1')
    expect(row).toBeDefined()
    expect(row.originalName).toBe('Original Name.jpg')
    expect(row.hasGps).toBe(true) // stored as INTEGER 1, mapped to boolean
    expect(row.lat).toBe(51.5)
    expect(row.thumbnailFilename).toBe('thumb_abc.jpg')
    expect(row.tags).toEqual([]) // null tags map to empty array
    expect(row.description).toBeNull()
  })

  it('finds a photo by hash with the same mapping', () => {
    const row = dbmod.getPhotoByHash('hash-1')
    expect(row).not.toBeNull()
    expect(row.id).toBe('photo-1')
    expect(row.hasGps).toBe(true)
    expect(row.surveyDate).toBe('2026-01-01')
  })

  it('returns null for an unknown hash', () => {
    expect(dbmod.getPhotoByHash('does-not-exist')).toBeNull()
  })

  it('round-trips description and JSON tags through updatePhoto', () => {
    dbmod.updatePhoto('photo-1', { description: 'field note', tags: ['a', 'b'] })
    const row = dbmod.getAllPhotos().find(p => p.id === 'photo-1')
    expect(row.description).toBe('field note')
    expect(row.tags).toEqual(['a', 'b'])
  })

  it('updates survey date independently', () => {
    dbmod.updatePhotoSurveyDate('photo-1', '2025-12-31')
    const row = dbmod.getAllPhotos().find(p => p.id === 'photo-1')
    expect(row.surveyDate).toBe('2025-12-31')
  })

  it('deletes a photo and reports the change count', () => {
    dbmod.insertPhoto(makePhoto({ id: 'photo-2', fileHash: 'hash-2' }))
    const changes = dbmod.deletePhoto('photo-2')
    expect(changes).toBe(1)
    expect(dbmod.getAllPhotos().find(p => p.id === 'photo-2')).toBeUndefined()
  })
})

describe('clients and projects', () => {
  it('creates a client and counts its projects', () => {
    dbmod.createClient({
      id: 'client-1',
      name: 'Acme',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const clients = dbmod.getAllClients()
    const acme = clients.find(c => c.id === 'client-1')
    expect(acme).toBeDefined()
    expect(acme.projectCount).toBe(0)
  })

  it('creates a project joined to its client name and photo count', () => {
    dbmod.createProject({
      id: 'project-1',
      name: 'Survey',
      clientId: 'client-1',
      status: 'active',
      color: '#e97b25',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const proj = dbmod.getAllProjects().find(p => p.id === 'project-1')
    expect(proj).toBeDefined()
    expect(proj.clientName).toBe('Acme')
    expect(proj.photoCount).toBe(0)
    // client project count now reflects the new project
    expect(dbmod.getAllClients().find(c => c.id === 'client-1').projectCount).toBe(1)
  })

  it('assigns a photo to a project and reflects it in the photo count', () => {
    dbmod.assignPhotosToProject('project-1', ['photo-1'])
    const row = dbmod.getAllPhotos().find(p => p.id === 'photo-1')
    expect(row.projectId).toBe('project-1')
    expect(dbmod.getAllProjects().find(p => p.id === 'project-1').photoCount).toBe(1)
  })

  it('deletes a project and returns the change count', () => {
    expect(dbmod.deleteProject('project-1')).toBe(1)
    expect(dbmod.getAllProjects().find(p => p.id === 'project-1')).toBeUndefined()
  })
})

describe('PERF-03: performance indexes', () => {
  it('creates indexes on the hot photo columns', () => {
    const raw = new Database(process.env.PHOTOS_DB_PATH, { readonly: true })
    const names = raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name)
    raw.close()
    expect(names).toContain('idx_photos_project_id')
    expect(names).toContain('idx_photos_uploaded_at')
    expect(names).toContain('idx_photos_survey_date')
  })
})

describe('resetAll', () => {
  it('clears every table', () => {
    dbmod.resetAll()
    expect(dbmod.getAllPhotos()).toEqual([])
    expect(dbmod.getAllProjects()).toEqual([])
    expect(dbmod.getAllClients()).toEqual([])
  })
})
