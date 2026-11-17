import { useState, useRef, type FormEvent } from 'react';
import type { Place } from '../../shared/api.ts';
import { useGeocode } from '../hooks/useGeocode.ts';

// ARCH-02: the location search, extracted from App.tsx. Owns its own
// query/results/error state; tells the parent where to fly via onFlyTo.
export function LocationSearch({
  onFlyTo,
}: {
  onFlyTo: (lat: number, lng: number, zoom: number) => void;
}) {
  const searchPlaces = useGeocode();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const data = await searchPlaces(query, controller.signal);
      const [only] = data;
      if (data.length === 0) {
        setError(`No locations found for "${query}"`);
      } else if (data.length === 1 && only) {
        onFlyTo(only.lat, only.lon, 12);
      } else {
        setResults(data);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Location search failed. Try again.');
    } finally {
      setSearching(false);
    }
  }

  function pick(result: Place) {
    onFlyTo(result.lat, result.lon, 12);
    setResults([]);
    setQuery(result.displayName.split(',')[0] ?? result.displayName);
  }

  return (
    <form className="location-search" onSubmit={handleSubmit}>
      <div className="location-search-wrap">
        <input
          type="text"
          className="location-search-input"
          placeholder="Search location…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError('');
            setResults([]);
          }}
          aria-label="Search for a location"
          aria-autocomplete="list"
        />
        <button
          type="submit"
          className="location-search-btn"
          disabled={searching}
          aria-label="Search location"
        >
          {searching ? '…' : 'Go'}
        </button>
      </div>
      {error && <p className="location-search-error">{error}</p>}
      {results.length > 0 && (
        <ul className="location-results-list" role="listbox" aria-label="Location results">
          {results.map((r, i) => (
            <li
              key={i}
              className="location-result-item"
              role="option"
              tabIndex={0}
              onClick={() => pick(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') pick(r);
              }}
            >
              {r.displayName}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
