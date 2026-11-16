import type { Photo, Project } from '../../shared/api.ts';
import { pointInPolygon, type LatLng } from './geo.ts';

export interface Bounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface PhotoFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  mapBounds?: Bounds | null;
  activeTag?: string | null;
  regionPolygon?: LatLng[] | null;
  /** A YYYY-MM-DD date, or 'undated'. */
  activeSurveyDate?: string | null;
  activeProjectId?: string | null;
  activeClientId?: string | null;
}

// Applies the sidebar filters (date range, map bounds, tag, drawn region, and the
// project/survey-date/client hierarchy) to the photo list. Pure — easy to test
// and to memoize (ARCH-02 / PERF-05). Extracted verbatim from App.tsx.
export function filterPhotos(photos: Photo[], filters: PhotoFilters, projects: Project[]): Photo[] {
  const {
    dateFrom,
    dateTo,
    mapBounds,
    activeTag,
    regionPolygon,
    activeSurveyDate,
    activeProjectId,
    activeClientId,
  } = filters;

  return photos.filter((p) => {
    if (dateFrom || dateTo) {
      if (p.dateTaken) {
        const date = p.dateTaken.slice(0, 10);
        if (dateFrom && date < dateFrom) return false;
        if (dateTo && date > dateTo) return false;
      }
    }
    if (mapBounds && p.hasGps && p.lat != null && p.lng != null) {
      if (p.lat < mapBounds.south || p.lat > mapBounds.north) return false;
      if (p.lng < mapBounds.west || p.lng > mapBounds.east) return false;
    }
    if (activeTag && !p.tags?.includes(activeTag)) return false;
    if (regionPolygon && p.hasGps && p.lat != null && p.lng != null) {
      if (!pointInPolygon([p.lat, p.lng], regionPolygon)) return false;
    }

    // Project / survey-date / client hierarchy
    if (activeProjectId && p.projectId !== activeProjectId) return false;
    if (activeSurveyDate === 'undated' && p.surveyDate != null) return false;
    if (activeSurveyDate && activeSurveyDate !== 'undated' && p.surveyDate !== activeSurveyDate) {
      return false;
    }
    if (activeClientId) {
      const proj = projects.find((pr) => pr.id === p.projectId);
      if (proj?.clientId !== activeClientId) return false;
    }
    return true;
  });
}
