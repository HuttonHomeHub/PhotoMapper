import exifr from 'exifr';

// Parses EXIF/GPS/XMP and derives the photo metadata fields we persist.
// Non-fatal: returns a best-effort object even when parsing fails (photos
// without GPS or EXIF still upload successfully).
export async function extractPhotoMetadata(filePath) {
  let exif = {};
  try {
    exif = (await exifr.parse(filePath, { gps: true, ifd0: true, exif: true, xmp: true })) || {};
  } catch {
    // EXIF parse failure is non-fatal
  }

  let panoHFov = null;
  if (exif.GPano?.FullPanoWidthPixels && exif.GPano?.CroppedAreaImageWidthPixels) {
    panoHFov = (exif.GPano.CroppedAreaImageWidthPixels / exif.GPano.FullPanoWidthPixels) * 360;
  }

  let exposureTime = null;
  if (exif.ExposureTime != null) {
    const et = exif.ExposureTime;
    exposureTime = et < 1 ? `1/${Math.round(1 / et)}s` : `${et}s`;
  }

  let dateTaken = null;
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
