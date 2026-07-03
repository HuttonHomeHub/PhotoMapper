import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import request from 'supertest'

// Seeds TEST-02 (API integration) and locks in BE-01 (async error handling).
// The app is imported with NODE_ENV=test so it does not bind a port, and with a
// throwaway PHOTOS_DB_PATH so it never touches the real database.

let app
let tmpDir

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'photomapper-api-'))
  process.env.PHOTOS_DB_PATH = join(tmpDir, 'test.db')
  process.env.NODE_ENV = 'test'
  ;({ app } = await import('../server/index.js'))
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('photos API', () => {
  it('GET /api/photos returns an array', async () => {
    const res = await request(app).get('/api/photos')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /api/photos with no file returns 400', async () => {
    const res = await request(app).post('/api/photos')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('PATCH /api/photos/:id for an unknown id returns 404', async () => {
    const res = await request(app).patch('/api/photos/does-not-exist').send({ description: 'x' })
    expect(res.status).toBe(404)
  })

  it('GET /api/photos/check-hash without a hash returns 400', async () => {
    const res = await request(app).get('/api/photos/check-hash')
    expect(res.status).toBe(400)
  })
})

describe('clients & projects API', () => {
  it('GET /api/clients and /api/projects return arrays', async () => {
    const clients = await request(app).get('/api/clients')
    const projects = await request(app).get('/api/projects')
    expect(clients.status).toBe(200)
    expect(Array.isArray(clients.body)).toBe(true)
    expect(projects.status).toBe(200)
    expect(Array.isArray(projects.body)).toBe(true)
  })

  it('POST /api/clients requires a name (400)', async () => {
    const res = await request(app).post('/api/clients').send({})
    expect(res.status).toBe(400)
  })

  it('POST /api/clients creates a client, then rejects a duplicate (409)', async () => {
    const first = await request(app).post('/api/clients').send({ name: 'Acme Co' })
    expect(first.status).toBe(201)
    expect(first.body.name).toBe('Acme Co')

    const dup = await request(app).post('/api/clients').send({ name: 'Acme Co' })
    expect(dup.status).toBe(409)
  })

  it('POST /api/projects requires a name (400)', async () => {
    const res = await request(app).post('/api/projects').send({})
    expect(res.status).toBe(400)
  })
})

describe('SEC-09/SEC-07: security middleware', () => {
  it('sets security headers (helmet + CSP)', async () => {
    const res = await request(app).get('/api/photos')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toBeDefined()
    expect(res.headers['content-security-policy']).toContain("default-src 'self'")
  })

  it('emits rate-limit headers on the API', async () => {
    const res = await request(app).get('/api/photos')
    // express-rate-limit standardHeaders: RateLimit-* present
    expect(res.headers['ratelimit-limit'] ?? res.headers['ratelimit']).toBeDefined()
  })
})

describe('SEC-02: reset endpoint is gated', () => {
  it('DELETE /api/reset returns 403 when ALLOW_RESET is not set', async () => {
    const res = await request(app).delete('/api/reset')
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })
})

describe('BE-01: async error handling', () => {
  it('an async route that throws returns 500, not a hung request', async () => {
    const res = await request(app).get('/__test/async-error')
    expect(res.status).toBe(500)
    expect(res.body).toHaveProperty('error')
  })
})
