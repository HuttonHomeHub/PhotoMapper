import { describe, it, expect } from 'vitest';
import { pointInPolygon } from '../../src/lib/geo.ts';
import { filterPhotos, type PhotoFilters } from '../../src/lib/filterPhotos.ts';
import { photo, project } from '../factories.ts';

const square = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 10 },
  { lat: 10, lng: 10 },
  { lat: 10, lng: 0 },
];

describe('pointInPolygon', () => {
  it('detects inside vs outside', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([15, 5], square)).toBe(false);
  });
});

describe('filterPhotos', () => {
  const photos = [
    photo({
      id: 'a',
      dateTaken: '2021-06-01T10:00:00Z',
      hasGps: true,
      lat: 5,
      lng: 5,
      tags: ['x'],
      projectId: 'p1',
      surveyDate: '2021-06-01',
    }),
    photo({
      id: 'b',
      dateTaken: '2020-01-01T10:00:00Z',
      hasGps: true,
      lat: 50,
      lng: 50,
      tags: [],
      projectId: 'p2',
      surveyDate: '2020-01-01',
    }),
    photo({
      id: 'c',
      dateTaken: null,
      hasGps: false,
      lat: null,
      lng: null,
      tags: ['x'],
      projectId: null,
      surveyDate: null,
    }),
  ];
  const projects = [project({ id: 'p1', clientId: 'c1' }), project({ id: 'p2', clientId: 'c2' })];
  const none: PhotoFilters = {
    dateFrom: '',
    dateTo: '',
    mapBounds: null,
    activeTag: null,
    regionPolygon: null,
    activeSurveyDate: null,
    activeProjectId: null,
    activeClientId: null,
  };
  const ids = (f: PhotoFilters) => filterPhotos(photos, f, projects).map((p) => p.id);

  it('returns everything with no filters', () => {
    expect(ids(none)).toEqual(['a', 'b', 'c']);
  });

  it('filters by date range (undated photos are not excluded)', () => {
    expect(ids({ ...none, dateFrom: '2021-01-01', dateTo: '2021-12-31' })).toEqual(['a', 'c']);
  });

  it('filters by tag', () => {
    expect(ids({ ...none, activeTag: 'x' })).toEqual(['a', 'c']);
  });

  it('filters by map bounds (only affects GPS photos)', () => {
    expect(ids({ ...none, mapBounds: { south: 0, north: 10, west: 0, east: 10 } })).toEqual([
      'a',
      'c',
    ]);
  });

  it('filters by drawn region (only affects GPS photos)', () => {
    expect(ids({ ...none, regionPolygon: square })).toEqual(['a', 'c']);
  });

  it('filters by project', () => {
    expect(ids({ ...none, activeProjectId: 'p1' })).toEqual(['a']);
  });

  it('filters by survey date, including "undated"', () => {
    expect(ids({ ...none, activeSurveyDate: '2020-01-01' })).toEqual(['b']);
    expect(ids({ ...none, activeSurveyDate: 'undated' })).toEqual(['c']);
  });

  it('filters by client via its projects', () => {
    expect(ids({ ...none, activeClientId: 'c1' })).toEqual(['a']);
  });
});
