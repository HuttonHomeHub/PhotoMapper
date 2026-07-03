const NOMINATIM_TIMEOUT_MS = 5000;
const USER_AGENT = 'fuzzy-guide/1.0';

// Cache key for a coordinate, rounded to ~111m so nearby points share an entry.
export function geoKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

// FE-05: forward place search proxied through the server so the browser never
// calls Nominatim directly (keeps the usage policy / User-Agent server-side and
// lets the /api rate limiter apply). Results are cached in-memory (LRU-capped)
// keyed by the normalized query — search results don't need to survive restarts,
// so this avoids a DB migration. Throws on upstream failure/timeout so the route
// can return a distinct 502 (vs. an empty-but-successful result).
const SEARCH_CACHE_MAX = 200;
const searchCache = new Map();

export async function searchPlaces(query) {
  const key = query.trim().toLowerCase();
  if (searchCache.has(key)) {
    const cached = searchCache.get(key);
    searchCache.delete(key); // re-insert to mark most-recently-used
    searchCache.set(key, cached);
    return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' }, signal: controller.signal }
    );
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();
    const results = data.map((r) => ({
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      displayName: r.display_name,
    }));
    searchCache.set(key, results);
    if (searchCache.size > SEARCH_CACHE_MAX) {
      searchCache.delete(searchCache.keys().next().value); // evict oldest
    }
    return results;
  } finally {
    clearTimeout(timer);
  }
}

// Test seam: clear the in-memory search cache between cases.
export function _clearSearchCache() {
  searchCache.clear();
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
      { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal }
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
