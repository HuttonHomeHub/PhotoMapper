const NOMINATIM_TIMEOUT_MS = 5000;

// Cache key for a coordinate, rounded to ~111m so nearby points share an entry.
export function geoKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

// Reverse-geocode a coordinate to a short place label via Nominatim, with a
// request timeout. Non-fatal: returns null on any failure/timeout.
// Called only from the rate-limited background queue (geocodeQueue.js) so we
// respect Nominatim's usage policy and never block the upload response.
export async function reverseGeocode(lat, lng) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'User-Agent': 'fuzzy-guide/1.0' }, signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const parts = [
      addr.city || addr.town || addr.village || addr.county,
      addr.state || addr.country,
    ].filter(Boolean);
    return parts.slice(0, 2).join(', ') || data.display_name?.split(',')[0] || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
