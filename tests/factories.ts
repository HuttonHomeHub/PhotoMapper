// Test data helpers with no Node or DOM dependencies (used by every kind of test).
import type { Client, Photo, Project } from '../shared/api.ts';

/** The value, or a clear test failure when it's missing (instead of a `!`). */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to be present`);
  return value;
}

/** A complete Photo as the API returns it; pass only the fields a test cares about. */
export function photo(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'p1',
    filename: 'p1.jpg',
    thumbnailFilename: 'thumb_p1.jpg',
    originalName: 'P1.jpg',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    hasGps: false,
    manualGps: false,
    lat: null,
    lng: null,
    altitude: null,
    imgDirection: null,
    dateTaken: null,
    surveyDate: null,
    cameraMake: null,
    cameraModel: null,
    focalLength: null,
    focalLengthIn35mm: null,
    panoHFov: null,
    fNumber: null,
    iso: null,
    exposureTime: null,
    locationName: null,
    description: null,
    tags: [],
    projectId: null,
    ...overrides,
  };
}

/** A complete Project as the API returns it. */
export function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'pr1',
    name: 'Project',
    clientId: null,
    clientName: null,
    status: 'active',
    color: '#e97b25',
    shareToken: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    photoCount: 0,
    ...overrides,
  };
}

/** A complete Client as the API returns it. */
export function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    name: 'Client',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    projectCount: 0,
    ...overrides,
  };
}
