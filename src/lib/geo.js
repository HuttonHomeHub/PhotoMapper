// Ray-casting point-in-polygon test. `point` is [lat, lng]; `polygon` is an
// array of { lat, lng }. Shared geo helper (CQ-01).
export function pointInPolygon([lat, lng], polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat,
      yi = polygon[i].lng
    const xj = polygon[j].lat,
      yj = polygon[j].lng
    if (yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}
