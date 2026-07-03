// PERF-06: a stable "visual signature" for a photo's map marker. Two photos with
// the same signature render an identical marker glyph + FOV cone, so the
// incremental map sync can skip rebuilding them. Only fields that affect the
// marker or FOV cone are included — editable fields (description, tags, project,
// survey date) are deliberately excluded, so editing them never churns the
// marker; the popup reads the latest photo data separately.
export function photoMarkerSignature(photo) {
  return [
    photo.lat,
    photo.lng,
    photo.imgDirection,
    photo.thumbnailFilename ?? photo.filename,
    photo.focalLengthIn35mm ?? photo.focalLength,
    photo.panoHFov,
  ].join('|');
}
