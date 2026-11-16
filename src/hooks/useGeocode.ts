import { useCallback } from 'react';
import { apiFetch } from '@hhh/ui';
import type { Place } from '../../shared/api.ts';

// FE-05: forward place search, proxied through the server (cache + rate limit)
// instead of calling Nominatim from the browser.
export function useGeocode(): (query: string, signal?: AbortSignal) => Promise<Place[]> {
  return useCallback(
    (query, signal) =>
      apiFetch<Place[]>(
        `/api/geocode/search?q=${encodeURIComponent(query)}`,
        signal ? { signal } : {}
      ),
    []
  );
}
