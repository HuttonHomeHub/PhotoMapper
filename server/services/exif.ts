import exifr from 'exifr';

// Parses EXIF/GPS/XMP and derives the photo metadata fields we persist.
// Non-fatal: returns a best-effort object even when parsing fails (photos
// without GPS or EXIF still upload successfully). exifr always reads IFD0 (camera
// make and model).
/** The EXIF tags PhotoMapper reads (exifr returns more). */
interface ExifTags {
  GPano?: { FullPanoWidthPixels?: number; CroppedAreaImageWidthPixels?: number };
  ExposureTime?: number;
  DateTimeOriginal?: Date | string;
  latitude?: number;
  longitude?: number;
  GPSAltitude?: number;
  GPSImgDirection?: number;
  Make?: string;
  Model?: string;
  FocalLength?: number;
  FNumber?: number;
  ISO?: number;
  FocalLengthIn35mmFormat?: number;
}

export interface PhotoMetadata {
  hasGps: boolean;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  imgDirection: number | null;
  dateTaken: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  focalLength: number | null;
  fNumber: number | null;
  iso: number | null;
  exposureTime: string | null;
  focalLengthIn35mm: number | null;
  panoHFov: number | null;
}

export async function extractPhotoMetadata(filePath: string): Promise<PhotoMetadata> {
  let exif: ExifTags = {};
  try {
    exif =
      ((await exifr.parse(filePath, { gps: true, exif: true, xmp: true })) as
        ExifTags | undefined) || {};
  } catch {
    // EXIF parse failure is non-fatal
  }

  let panoHFov: number | null = null;
  if (exif.GPano?.FullPanoWidthPixels && exif.GPano?.CroppedAreaImageWidthPixels) {
    panoHFov = (exif.GPano.CroppedAreaImageWidthPixels / exif.GPano.FullPanoWidthPixels) * 360;
  }

  let exposureTime: string | null = null;
  if (exif.ExposureTime != null) {
    const et = exif.ExposureTime;
    exposureTime = et < 1 ? `1/${Math.round(1 / et)}s` : `${et}s`;
  }

  let dateTaken: string | null = null;
  if (exif.DateTimeOriginal) {
    dateTaken =
      exif.DateTimeOriginal instanceof Date
        ? exif.DateTimeOriginal.toISOString()
        : String(exif.DateTimeOriginal);
  }

  return {
    hasGps: exif.latitude != null && exif.longitude != null,
    lat: exif.latitude ?? null,
    lng: exif.longitude ?? null,
    altitude: exif.GPSAltitude ?? null,
    imgDirection: exif.GPSImgDirection ?? null,
    dateTaken,
    cameraMake: exif.Make ?? null,
    cameraModel: exif.Model ?? null,
    focalLength: exif.FocalLength ?? null,
    fNumber: exif.FNumber ?? null,
    iso: exif.ISO ?? null,
    exposureTime,
    focalLengthIn35mm: exif.FocalLengthIn35mmFormat ?? null,
    panoHFov,
  };
}
