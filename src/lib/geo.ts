export interface LatLng {
  lat: number;
  lng: number;
}

// Ray-casting point-in-polygon test. `point` is [lat, lng]; `polygon` is an
// array of { lat, lng }. Shared geo helper (CQ-01).
export function pointInPolygon([lat, lng]: [number, number], polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const [xi, yi, xj, yj] = [a.lat, a.lng, b.lat, b.lng];
    if (yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
