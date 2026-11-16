import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import sharp from 'sharp';

// Backups and restore through the API, on a throwaway data folder.
let app;
let dir;
const TOKEN = 'test-csrf-token';
const write = (method, url) =>
  request(app)[method](url).set('Cookie', `hhh_csrf=${TOKEN}`).set('X-CSRF-Token', TOKEN);

function binary(res, done) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'photomapper-backups-'));
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = dir;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
  delete process.env.BACKUP_DIR;
  ({ app } = await import('../server/index.ts'));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('backups and restore', () => {
  let photo;
  let backupName;

  it('backs up the database and uploads on demand', async () => {
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    photo = (await write('post', '/api/photos').attach('photo', jpeg, 'keep.jpg')).body;

    const res = await write('post', '/api/backup');
    expect(res.status).toBe(201);
    expect(res.body.name).toMatch(/^photomapper-backup-\d{8}-\d{6}\.zip$/);
    expect(res.body.size).toBeGreaterThan(0);
    backupName = res.body.name;
    expect(existsSync(join(dir, 'backups', backupName))).toBe(true);
  });

  it('lists backups with the settings and the schedule', async () => {
    const res = await request(app).get('/api/backup');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: true,
      intervalHours: 24,
      keep: 7,
      includeUploads: true,
      scheduler: { enabled: true, intervalHours: 24 },
    });
    expect(res.body.backups.map((b) => b.name)).toEqual([backupName]);
  });

  it('downloads a listed backup, and only names it wrote', async () => {
    const res = await request(app).get(`/api/backup/download/${backupName}`).buffer().parse(binary);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 2).toString()).toBe('PK');
    expect((await request(app).get('/api/backup/download/photos.db')).status).toBe(404);
    expect((await request(app).get('/api/backup/download/..%2Fphotos.db')).status).toBe(404);
  });

  it('streams a fresh backup without keeping it', async () => {
    const res = await request(app).get('/api/backup/download').buffer().parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/photomapper-backup-.*\.zip/);
    expect(res.body.subarray(0, 2).toString()).toBe('PK');
    const list = await request(app).get('/api/backup');
    expect(list.body.backups).toHaveLength(1);
  });

  it('restores a backup by name, taking a safety backup first', async () => {
    await write('delete', `/api/photos/${photo.id}`);
    expect((await request(app).get('/api/photos')).body).toHaveLength(0);

    const res = await write('post', '/api/backup/restore').send({ name: backupName });
    expect(res.status).toBe(200);
    expect(res.body.restoredUploads).toBe(true);
    expect(res.body.safetyBackup).toMatch(/-prerestore\.zip$/);
    expect(res.body.counts.photos).toBe(1);

    const photos = (await request(app).get('/api/photos')).body;
    expect(photos.map((p) => p.id)).toEqual([photo.id]);
    expect(existsSync(join(dir, 'uploads', photo.filename))).toBe(true);
    // The reopened database keeps working for writes.
    expect((await write('post', '/api/clients').send({ name: 'After' })).status).toBe(201);
  });

  it('restores an uploaded backup zip', async () => {
    const zip = await request(app).get(`/api/backup/download/${backupName}`).buffer().parse(binary);
    const res = await write('post', '/api/backup/restore').attach('file', zip.body, 'mine.zip');
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ photos: 1, clients: 0 });
  });

  it('refuses bad restores without touching anything', async () => {
    const bad = await write('post', '/api/backup/restore').send({ name: '../photos.db' });
    expect(bad.status).toBe(400);
    const missing = await write('post', '/api/backup/restore').send({
      name: 'photomapper-backup-20000101-000000.zip',
    });
    expect(missing.status).toBe(404);
    const notZip = await write('post', '/api/backup/restore').attach(
      'file',
      Buffer.from('not a zip'),
      'fake.zip'
    );
    expect(notZip.status).toBe(400);
    const wrongType = await write('post', '/api/backup/restore').attach(
      'file',
      Buffer.from('x'),
      'notes.txt'
    );
    expect(wrongType.status).toBe(400);
    expect((await write('post', '/api/backup/restore').send({})).status).toBe(400);
    expect((await request(app).get('/api/photos')).body).toHaveLength(1);
  });

  it('reports the instance information for the Settings panel', async () => {
    const res = await request(app).get('/api/info');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: 'dev',
      counts: { photos: 1, projects: 0, clients: 0 },
      paths: {
        database: join(dir, 'photos.db'),
        uploads: join(dir, 'uploads'),
        backups: join(dir, 'backups'),
      },
      limits: { maxUploadMb: 60, apiRate: { limit: 1000, windowMs: 900000 } },
      trustProxyHops: 0,
    });
  });
});
