import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { geoKey } from '../server/services/geocode.js';

// BE-07/SEC-05: exercises the cache + background-queue logic without touching
// the network (only the cache-hit path is driven).

let db;
let queue;
let tmpDir;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'photomapper-geo-'));
  process.env.PHOTOS_DB_PATH = join(tmpDir, 'geo.db');
  db = await import('../server/db.js');
  queue = await import('../server/services/geocodeQueue.js');
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe('geoKey', () => {
  it('rounds to ~111m so nearby coordinates share a key', () => {
    expect(geoKey(51.5, -0.12)).toBe('51.500,-0.120');
    expect(geoKey(51.50001, -0.12001)).toBe(geoKey(51.50002, -0.12002));
  });
});

describe('geocode cache', () => {
  it('miss returns undefined; hit returns the stored value (including null)', () => {
    expect(db.getGeocodeCache('nope')).toBeUndefined();
    db.setGeocodeCache('k1', 'London, UK');
    expect(db.getGeocodeCache('k1')).toBe('London, UK');
    db.setGeocodeCache('k2', null); // cached "no result"
    expect(db.getGeocodeCache('k2')).toBeNull();
  });
});

function seedPhoto(id, lat, lng, hash) {
  db.insertPhoto({
    id,
    filename: `${id}.jpg`,
    thumbnailFilename: null,
    originalName: id,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    hasGps: 1,
    lat,
    lng,
    altitude: null,
    imgDirection: null,
    dateTaken: null,
    surveyDate: null,
    cameraMake: null,
    cameraModel: null,
    focalLength: null,
    fNumber: null,
    iso: null,
    exposureTime: null,
    fileHash: hash,
    locationName: null,
    projectId: null,
    focalLengthIn35mm: null,
    panoHFov: null,
  });
}

describe('enqueueGeocode (cache-hit path, no network)', () => {
  it('writes the cached location onto the photo', async () => {
    seedPhoto('geo-1', 10, 20, 'geo-hash-1');
    db.setGeocodeCache(geoKey(10, 20), 'Testville');

    expect(queue.cachedLocation(10, 20)).toBe('Testville');
    await queue.enqueueGeocode('geo-1', 10, 20);

    const photo = db.getAllPhotos().find((p) => p.id === 'geo-1');
    expect(photo.locationName).toBe('Testville');
  });
});
