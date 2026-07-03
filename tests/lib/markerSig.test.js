import { describe, it, expect } from 'vitest';
import { photoMarkerSignature } from '../../src/lib/markerSig.js';

// PERF-06: the incremental map sync uses this signature to decide whether an
// existing marker can be left untouched.
const base = {
  id: 'a',
  lat: 1,
  lng: 2,
  imgDirection: 90,
  thumbnailFilename: 't.jpg',
  filename: 'f.jpg',
  focalLength: 35,
  focalLengthIn35mm: 50,
  panoHFov: null,
  description: 'x',
  tags: ['a'],
  projectId: 'p1',
  surveyDate: '2026-01-01',
};

describe('photoMarkerSignature (PERF-06)', () => {
  it('is stable when only editable fields change', () => {
    const edited = { ...base, description: 'y', tags: [], projectId: 'p2', surveyDate: '2026-02-02' };
    expect(photoMarkerSignature(edited)).toBe(photoMarkerSignature(base));
  });

  it('changes when a marker/FOV field changes', () => {
    expect(photoMarkerSignature({ ...base, lat: 9 })).not.toBe(photoMarkerSignature(base));
    expect(photoMarkerSignature({ ...base, lng: 9 })).not.toBe(photoMarkerSignature(base));
    expect(photoMarkerSignature({ ...base, imgDirection: 180 })).not.toBe(photoMarkerSignature(base));
    expect(photoMarkerSignature({ ...base, panoHFov: 200 })).not.toBe(photoMarkerSignature(base));
  });

  it('falls back to filename when there is no thumbnail', () => {
    expect(photoMarkerSignature({ ...base, thumbnailFilename: null })).toContain('f.jpg');
  });
});
