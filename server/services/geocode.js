// Reverse-geocode a coordinate to a short place label via Nominatim.
// Non-fatal: returns null on any failure.
//
// NOTE (SEC-05 / BE-07): this currently runs inline in the upload request with
// no timeout, cache, or rate limit — a follow-up will move it to a background
// job with a cache and a <=1 req/s limiter to respect Nominatim's usage policy.
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'User-Agent': 'fuzzy-guide/1.0' } }
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
  }
}
