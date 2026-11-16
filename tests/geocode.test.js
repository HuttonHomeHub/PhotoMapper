import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { geoKey, searchPlaces, _clearSearchCache } from '../server/services/geocode.js';

// BE-07/SEC-05: exercises the cache + background-queue logic without touching
// the network (only the cache-hit path is driven).

let db;
let queue;
let tmpDir;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'photomapper-geo-'));
  process.env.DB_PATH = join(tmpDir, 'geo.db');
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

// FE-05: forward search proxy service (network mocked).
describe('searchPlaces', () => {
  afterEach(() => {
    _clearSearchCache();
    vi.unstubAllGlobals();
  });

  it('maps Nominatim rows to {lat,lon,displayName} numbers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ lat: '51.5', lon: '-0.12', display_name: 'London, UK' }],
      })
    );
    const results = await searchPlaces('London');
    expect(results).toEqual([{ lat: 51.5, lon: -0.12, displayName: 'London, UK' }]);
  });

  it('caches by normalized query (second call does not re-fetch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '1', lon: '2', display_name: 'A' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    await searchPlaces('Paris');
    await searchPlaces('  paris  '); // same after trim+lowercase
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on an upstream error (so the route can return 502)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(searchPlaces('boom')).rejects.toThrow();
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
