// The API's request and response shapes, shared by the server (server/) and the browser
// (src/) so the two can't drift. Types only: nothing here exists at runtime.

/** A photo as the API returns it. */
export interface Photo {
  id: string;
  filename: string;
  thumbnailFilename: string | null;
  originalName: string;
  uploadedAt: string;
  hasGps: boolean;
  manualGps: boolean;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  imgDirection: number | null;
  dateTaken: string | null;
  surveyDate: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  focalLength: number | null;
  focalLengthIn35mm: number | null;
  panoHFov: number | null;
  fNumber: number | null;
  iso: number | null;
  exposureTime: string | null;
  locationName: string | null;
  description: string | null;
  tags: string[];
  projectId: string | null;
}

/** A project as the API returns it. */
export interface Project {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  status: string;
  color: string;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
}

/** A client as the API returns it. */
export interface Client {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectCount: number;
}

/** GET /api/photos with filters or paging. */
export interface PhotoPage {
  items: Photo[];
  total: number;
  limit: number | null;
  offset: number;
}

/** A place from GET /api/geocode/search. */
export interface Place {
  lat: number;
  lon: number;
  displayName: string;
}

/** The photo fields the public share view sends (GET /api/public/share/:token). */
export type SharedPhoto = Pick<
  Photo,
  | 'id'
  | 'originalName'
  | 'filename'
  | 'thumbnailFilename'
  | 'hasGps'
  | 'lat'
  | 'lng'
  | 'altitude'
  | 'imgDirection'
  | 'dateTaken'
  | 'locationName'
  | 'description'
  | 'tags'
>;

export interface Share {
  project: { name: string; color: string };
  photos: SharedPhoto[];
}

/** The 409 reply to an upload whose content is already stored. */
export interface DuplicateReply {
  error: 'duplicate';
  message: string;
  photo: Photo | null;
}

/** GET /api/info: how this instance is set up. */
export interface InstanceInfoReply {
  version: string;
  counts: { photos: number; projects: number; clients: number };
  paths: { database: string; uploads: string; backups: string };
  limits: { maxUploadMb: number; apiRate: { limit: number; windowMs: number } };
  trustProxyHops: number;
}

/** GET /api/backup. */
export interface BackupsReply {
  enabled: boolean;
  dir: string;
  intervalHours: number;
  keep: number;
  includeUploads: boolean;
  backups: Array<{ name: string; size: number; createdAt: string }>;
  scheduler: {
    enabled: boolean;
    intervalHours: number;
    lastSuccessAt?: string;
    lastError?: string;
    nextRunAt?: string;
  };
}

/** POST /api/backup/restore. */
export interface RestoreReply {
  safetyBackup: string;
  restoredUploads: boolean;
  counts: { photos: number; projects: number; clients: number };
}
