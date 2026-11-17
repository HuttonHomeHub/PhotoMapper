import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Express } from 'express';
import request from 'supertest';
import sharp from 'sharp';
import type { Photo, SharedPhoto } from '../shared/api.ts';
import { csrfWriter } from './helpers.ts';

// Seeds TEST-02 (API integration) and locks in BE-01 (async error handling).
// The app is imported with NODE_ENV=test so it does not bind a port, and with a
// throwaway DB_PATH + UPLOADS_DIR so it never touches real data.

let app: Express;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'photomapper-api-'));
  process.env.DB_PATH = join(tmpDir, 'test.db');
  process.env.UPLOADS_DIR = join(tmpDir, 'uploads');
  process.env.NODE_ENV = 'test';
  ({ app } = await import('../server/index.ts'));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Writes carry the CSRF cookie and the same token in the header, as apiFetch sends them.
const write = csrfWriter(() => app);

describe('CSRF protection', () => {
  it('issues the token cookie on a page load', async () => {
    const res = await request(app).get('/api/photos');
    expect(String(res.headers['set-cookie'])).toMatch(/hhh_csrf=/);
  });

  it('rejects a write without the token', async () => {
    const res = await request(app).post('/api/clients').send({ name: 'No token' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF/);
  });
});

describe('errors and unknown paths', () => {
  it('answers an unknown /api path with a JSON 404', async () => {
    const res = await request(app).get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('rejects an upload of an unsupported type with 400', async () => {
    const res = await write('post', '/api/photos').attach('photo', Buffer.from('hello'), {
      filename: 'notes.txt',
      contentType: 'text/plain',
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Unsupported file type: text/plain' });
  });
});

describe('photos API', () => {
  it('GET /api/photos returns an array', async () => {
    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('PERF-01: GET /api/photos with a paging param returns { items, total }', async () => {
    const res = await request(app).get('/api/photos?limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(0);
  });

  it('POST /api/photos with no file returns 400', async () => {
    const res = await write('post', '/api/photos');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('TEST-02: uploads a real (no-GPS) image, then 409s on the duplicate', async () => {
    // A synthetic JPEG with no EXIF exercises the full path: multer → hash →
    // exif (no GPS) → thumbnail (sharp) → insert.
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const up = await write('post', '/api/photos').attach('photo', jpeg, 'sample.jpg');
    expect(up.status).toBe(201);
    expect(up.body.hasGps).toBe(false);
    expect(up.body.id).toBeTruthy();
    expect(up.body.originalName).toBe('sample.jpg');

    // Same bytes → same content hash → duplicate rejected.
    const dup = await write('post', '/api/photos').attach('photo', jpeg, 'sample.jpg');
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('duplicate');

    // It shows up in the listing and can be deleted.
    const list = await request(app).get('/api/photos');
    expect((list.body as Photo[]).some((p) => p.id === up.body.id)).toBe(true);
    const del = await write('delete', `/api/photos/${up.body.id}`);
    expect(del.status).toBe(200);
  });

  it('SEC-06: rejects a non-image sent with an image extension (400)', async () => {
    const notAnImage = Buffer.from('this is definitely not an image');
    const res = await write('post', '/api/photos').attach('photo', notAnImage, 'evil.jpg');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a supported image/i);
  });

  it('PATCH /api/photos/:id for an unknown id returns 404', async () => {
    const res = await write('patch', '/api/photos/does-not-exist').send({ description: 'x' });
    expect(res.status).toBe(404);
  });

  it('GET /api/photos/:id for an unknown id returns 404', async () => {
    const res = await request(app).get('/api/photos/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/photos/export is not captured by the :id route', async () => {
    const res = await request(app).get('/api/photos/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/geo+json');
    expect(res.headers['content-disposition']).toContain('photos.geojson');
  });

  it('GET /api/photos/export?format=kml returns a KML attachment', async () => {
    const res = await request(app).get('/api/photos/export?format=kml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.google-earth.kml+xml');
    expect(res.text).toContain('<kml');
  });
});

describe('clients & projects API', () => {
  it('GET /api/clients and /api/projects return arrays', async () => {
    const clients = await request(app).get('/api/clients');
    const projects = await request(app).get('/api/projects');
    expect(clients.status).toBe(200);
    expect(Array.isArray(clients.body)).toBe(true);
    expect(projects.status).toBe(200);
    expect(Array.isArray(projects.body)).toBe(true);
  });

  it('POST /api/clients requires a name (400)', async () => {
    const res = await write('post', '/api/clients').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/clients creates a client, then rejects a duplicate (409)', async () => {
    const first = await write('post', '/api/clients').send({ name: 'Acme Co' });
    expect(first.status).toBe(201);
    expect(first.body.name).toBe('Acme Co');

    const dup = await write('post', '/api/clients').send({ name: 'Acme Co' });
    expect(dup.status).toBe(409);
  });

  it('POST /api/projects requires a name (400)', async () => {
    const res = await write('post', '/api/projects').send({});
    expect(res.status).toBe(400);
  });
});

describe('BE-03/BE-04: update semantics', () => {
  let clientId: string;
  let projectId: string;

  it('sets up a client and a project', async () => {
    const c = await write('post', '/api/clients').send({ name: 'Update Co' });
    clientId = c.body.id;
    const p = await write('post', '/api/projects').send({ name: 'Proj A', clientId });
    projectId = p.body.id;
    expect(p.status).toBe(201);
    expect(p.body.clientId).toBe(clientId);
  });

  it('BE-03: an explicit clientId:null unassigns the client', async () => {
    const res = await write('patch', `/api/projects/${projectId}`).send({ clientId: null });
    expect(res.status).toBe(200);
    expect(res.body.clientId).toBeNull();
  });

  it('BE-03: a partial update leaves other fields intact', async () => {
    const res = await write('patch', `/api/projects/${projectId}`).send({ status: 'archived' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('archived');
    expect(res.body.name).toBe('Proj A');
  });

  it('BE-03: unknown project returns 404', async () => {
    const res = await write('patch', '/api/projects/nope').send({ status: 'active' });
    expect(res.status).toBe(404);
  });

  it('BE-03: a blank name returns 400', async () => {
    const res = await write('patch', `/api/projects/${projectId}`).send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('BE-04: unknown client returns 404', async () => {
    const res = await write('patch', '/api/clients/nope').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('BE-04: a blank name returns 400', async () => {
    const res = await write('patch', `/api/clients/${clientId}`).send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('BE-04: renaming to an existing client name returns 409', async () => {
    await write('post', '/api/clients').send({ name: 'Existing Co' });
    const res = await write('patch', `/api/clients/${clientId}`).send({ name: 'Existing Co' });
    expect(res.status).toBe(409);
  });
});

describe('BE-02: request validation', () => {
  it('rejects a batch update with no ids (400)', async () => {
    const res = await write('patch', '/api/photos/batch').send({ ids: [] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('details');
  });

  it('accepts a well-formed batch update (200)', async () => {
    const res = await write('patch', '/api/photos/batch').send({
      ids: ['no-such-photo'],
      tags: ['x'],
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('updated');
  });

  it('rejects an invalid surveyDate before the 404 check (400)', async () => {
    const res = await write('patch', '/api/photos/any-id').send({ surveyDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-array tags field (400)', async () => {
    const res = await write('patch', '/api/photos/any-id').send({ tags: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects project photo assignment with no photoIds (400)', async () => {
    const res = await write('patch', '/api/projects/any-id/photos').send({ photoIds: [] });
    expect(res.status).toBe(400);
  });
});

describe('FE-05: geocode search proxy', () => {
  it('GET /api/geocode/search with no query returns 400 (no upstream call)', async () => {
    const res = await request(app).get('/api/geocode/search');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('OPS-04: health & readiness probes', () => {
  it('GET /health returns 200 without touching the database', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: 'dev' });
  });

  it('GET /version reports the running version', async () => {
    const res = await request(app).get('/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: 'dev' });
  });

  it('GET /ready returns 200 when the database is reachable', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });
});

describe('SEC-09/SEC-07: security middleware', () => {
  it('sets security headers (helmet + CSP)', async () => {
    const res = await request(app).get('/api/photos');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('emits rate-limit headers on the API', async () => {
    const res = await request(app).get('/api/photos');
    // express-rate-limit standardHeaders: RateLimit-* present
    expect(res.headers['ratelimit-limit'] ?? res.headers['ratelimit']).toBeDefined();
  });
});

describe('SEC-02: reset endpoint is gated', () => {
  it('DELETE /api/reset returns 403 when ALLOW_RESET is not set', async () => {
    const res = await write('delete', '/api/reset');
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });
});

describe('BE-01: async error handling', () => {
  it('an async route that throws returns 500, not a hung request', async () => {
    const res = await request(app).get('/__test/async-error');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

describe('FEAT: manual GPS placement', () => {
  let photoId: string;

  it('uploads a no-GPS photo to place', async () => {
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .jpeg()
      .toBuffer();
    const up = await write('post', '/api/photos').attach('photo', jpeg, 'place-me.jpg');
    expect(up.status).toBe(201);
    expect(up.body.hasGps).toBe(false);
    photoId = up.body.id;
  });

  it('PUT /:id/location places the photo and flags it manual', async () => {
    const res = await write('put', `/api/photos/${photoId}/location`).send({
      lat: 51.5,
      lng: -0.12,
    });
    expect(res.status).toBe(200);
    expect(res.body.hasGps).toBe(true);
    expect(res.body.manualGps).toBe(true);
    expect(res.body.lat).toBeCloseTo(51.5);
    expect(res.body.lng).toBeCloseTo(-0.12);
  });

  it('rejects out-of-range coordinates (400)', async () => {
    const res = await write('put', `/api/photos/${photoId}/location`).send({ lat: 200, lng: 0 });
    expect(res.status).toBe(400);
  });

  it('PUT /:id/location for an unknown photo returns 404', async () => {
    const res = await write('put', '/api/photos/nope/location').send({ lat: 1, lng: 1 });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id/location clears the manual pin back to no-GPS', async () => {
    const res = await write('delete', `/api/photos/${photoId}/location`);
    expect(res.status).toBe(200);
    expect(res.body.hasGps).toBe(false);
    expect(res.body.manualGps).toBe(false);
    expect(res.body.lat).toBeNull();
  });

  it('DELETE /:id/location on a photo with no manual pin returns 409', async () => {
    const res = await write('delete', `/api/photos/${photoId}/location`);
    expect(res.status).toBe(409);
  });
});

describe('FEAT: project share links', () => {
  let projectId: string;
  let sharedPhotoId: string;
  let token: string;

  it('sets up a project with one placed photo', async () => {
    const p = await write('post', '/api/projects').send({ name: 'Shared Job' });
    projectId = p.body.id;
    expect(p.body.shareToken).toBeNull();

    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 5, g: 15, b: 25 } },
    })
      .jpeg()
      .toBuffer();
    const up = await write('post', '/api/photos').attach('photo', jpeg, 'shared.jpg');
    sharedPhotoId = up.body.id;
    await write('patch', `/api/photos/${sharedPhotoId}`).send({ projectId });
    await write('put', `/api/photos/${sharedPhotoId}/location`).send({ lat: 40.4, lng: -3.7 });
  });

  it('an un-shared project 404s on the public endpoint even with a guessed token', async () => {
    const res = await request(app).get('/api/public/share/totally-made-up-token');
    expect(res.status).toBe(404);
  });

  it('POST /:id/share mints a token; repeat calls are idempotent', async () => {
    const res = await write('post', `/api/projects/${projectId}/share`);
    expect(res.status).toBe(200);
    expect(res.body.shareToken).toBeTruthy();
    token = res.body.shareToken;

    const again = await write('post', `/api/projects/${projectId}/share`);
    expect(again.body.shareToken).toBe(token);
  });

  it('the public endpoint returns only the project name and its photos', async () => {
    const res = await request(app).get(`/api/public/share/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe('Shared Job');
    expect(res.body.project).not.toHaveProperty('shareToken');
    expect((res.body.photos as SharedPhoto[]).some((p) => p.id === sharedPhotoId)).toBe(true);
    // Only safe fields are exposed — no file hash, project id, or client data.
    const sample = res.body.photos[0];
    expect(sample).not.toHaveProperty('fileHash');
    expect(sample).not.toHaveProperty('projectId');
  });

  it('DELETE /:id/share revokes access — the old link 404s', async () => {
    const del = await write('delete', `/api/projects/${projectId}/share`);
    expect(del.status).toBe(200);
    expect(del.body.shareToken).toBeNull();

    const gone = await request(app).get(`/api/public/share/${token}`);
    expect(gone.status).toBe(404);
  });
});
