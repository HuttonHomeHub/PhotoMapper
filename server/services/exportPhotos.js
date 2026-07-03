// Serialization of geotagged photos to GeoJSON and KML for export.

export function toGeoJSON(photos) {
  return {
    type: 'FeatureCollection',
    features: photos.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat, p.altitude ?? 0] },
      properties: {
        id: p.id,
        name: p.originalName,
        dateTaken: p.dateTaken,
        uploadedAt: p.uploadedAt,
        cameraMake: p.cameraMake,
        cameraModel: p.cameraModel,
        focalLength: p.focalLength,
        fNumber: p.fNumber,
        iso: p.iso,
        exposureTime: p.exposureTime,
        altitude: p.altitude,
        imgDirection: p.imgDirection,
        locationName: p.locationName,
        description: p.description,
        tags: p.tags,
      },
    })),
  };
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function toKML(photos) {
  const placemarks = photos
    .map((p) => {
      const extData = [
        p.dateTaken && `<Data name="dateTaken"><value>${esc(p.dateTaken)}</value></Data>`,
        p.cameraMake &&
          `<Data name="camera"><value>${esc([p.cameraMake, p.cameraModel].filter(Boolean).join(' '))}</value></Data>`,
        p.altitude != null && `<Data name="altitude"><value>${p.altitude}m</value></Data>`,
        p.locationName && `<Data name="location"><value>${esc(p.locationName)}</value></Data>`,
        p.description && `<Data name="description"><value>${esc(p.description)}</value></Data>`,
        p.tags?.length && `<Data name="tags"><value>${esc(p.tags.join(', '))}</value></Data>`,
      ]
        .filter(Boolean)
        .join('\n      ');
      return `  <Placemark>
    <name>${esc(p.originalName)}</name>
    <ExtendedData>${extData ? `\n      ${extData}\n    ` : ''}</ExtendedData>
    <Point><coordinates>${p.lng},${p.lat},${p.altitude ?? 0}</coordinates></Point>
  </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Photo Locations</name>
${placemarks}
</Document>
</kml>`;
}
