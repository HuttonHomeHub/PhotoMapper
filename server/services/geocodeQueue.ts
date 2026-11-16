import { getGeocodeCache, setGeocodeCache, updatePhoto } from '../db.ts';
import { reverseGeocode, geoKey } from './geocode.ts';

// BE-07/SEC-05: keep reverse-geocoding off the upload request path. Uploads
// return immediately; uncached coordinates are resolved in the background by a
// single serial worker that spaces requests >=1/s (Nominatim policy), caches the
// result (including "no result"), and writes the label back onto the photo.

const MIN_INTERVAL_MS = 1100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let chain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

// Synchronous cache lookup for the upload path: returns the label if already
// known (string), null if known to have no result, or undefined on a cache miss.
export function cachedLocation(lat: number, lng: number): string | null | undefined {
  return getGeocodeCache(geoKey(lat, lng));
}

// Queue a background reverse-geocode for a photo. Fire-and-forget in production;
// returns the promise so tests can await the cache-hit path. Never rejects.
export function enqueueGeocode(photoId: string, lat: number, lng: number): Promise<void> {
  chain = chain
    .then(async () => {
      const key = geoKey(lat, lng);
      let name = getGeocodeCache(key);
      if (name === undefined) {
        const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
        if (wait > 0) await sleep(wait);
        lastRequestAt = Date.now();
        name = await reverseGeocode(lat, lng);
        setGeocodeCache(key, name);
      }
      if (name) updatePhoto(photoId, { locationName: name });
    })
    .catch(() => {});
  return chain;
}
