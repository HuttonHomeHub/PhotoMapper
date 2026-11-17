import { describe, it, expect } from 'vitest';
import type { Photo } from '../shared/api.ts';
import { toGeoJSON, toKML } from '../server/services/exportPhotos.ts';
import { must, photo as basePhoto } from './factories.ts';

// TEST-02: export serializers are pure and security-relevant (KML embeds
// user-supplied names/descriptions into XML), so they get direct coverage.

const photo = (over: Partial<Photo> = {}): Photo =>
  basePhoto({
    id: 'p1',
    originalName: 'IMG_1.jpg',
    lat: 51.5,
    lng: -0.12,
    altitude: 42,
    dateTaken: '2026-01-01T12:00:00.000Z',
    uploadedAt: '2026-01-02T00:00:00.000Z',
    cameraMake: 'Canon',
    cameraModel: 'EOS',
    focalLength: 35,
    fNumber: 2.8,
    iso: 100,
    exposureTime: '1/200s',
    imgDirection: 180,
    locationName: 'London, UK',
    description: 'a note',
    tags: ['survey', 'north'],
    ...over,
  });

describe('toGeoJSON', () => {
  it('wraps photos in a FeatureCollection with [lng, lat, altitude] points', () => {
    const gj = toGeoJSON([photo()]);
    expect(gj.type).toBe('FeatureCollection');
    expect(gj.features).toHaveLength(1);
    const f = must(gj.features[0]);
    expect(f.type).toBe('Feature');
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [-0.12, 51.5, 42] });
    expect(f.properties.name).toBe('IMG_1.jpg');
    expect(f.properties.tags).toEqual(['survey', 'north']);
  });

  it('defaults a missing altitude to 0', () => {
    const gj = toGeoJSON([photo({ altitude: null })]);
    expect(gj.features[0]?.geometry.coordinates[2]).toBe(0);
  });

  it('serializes an empty list to an empty feature array', () => {
    expect(toGeoJSON([])).toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('toKML', () => {
  it('produces a KML document with one placemark per photo', () => {
    const kml = toKML([photo(), photo({ id: 'p2' })]);
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml.match(/<Placemark>/g)).toHaveLength(2);
    expect(kml).toContain('<coordinates>-0.12,51.5,42</coordinates>');
  });

  it('XML-escapes user-supplied fields (no raw markup leaks in)', () => {
    const kml = toKML([
      photo({ originalName: '<script>alert(1)</script>', description: 'a & b "c"' }),
    ]);
    expect(kml).not.toContain('<script>');
    expect(kml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(kml).toContain('a &amp; b &quot;c&quot;');
  });

  it('omits ExtendedData content when optional fields are absent', () => {
    const kml = toKML([
      basePhoto({
        id: 'p3',
        originalName: 'bare.jpg',
        lat: 1,
        lng: 2,
        altitude: null,
        tags: [],
      }),
    ]);
    expect(kml).toContain('<ExtendedData></ExtendedData>');
    expect(kml).toContain('<coordinates>2,1,0</coordinates>');
  });
});
