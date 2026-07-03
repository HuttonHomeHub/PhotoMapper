import { useState, useRef } from 'react'

// ARCH-02: the Nominatim location search, extracted from App.jsx. Owns its own
// query/results/error state; tells the parent where to fly via onFlyTo.
// (No semicolons: matches the src/ style until CQ-07 normalizes the directory.)
export function LocationSearch({ onFlyTo }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!query.trim()) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    setError('')
    setResults([])
    try {
      // FE-05: proxied through the server (cache + rate-limit) instead of hitting
      // Nominatim directly from the browser.
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.length === 0) {
        setError(`No locations found for "${query}"`)
      } else if (data.length === 1) {
        onFlyTo(data[0].lat, data[0].lon, 12)
      } else {
        setResults(data)
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError('Location search failed. Try again.')
    } finally {
      setSearching(false)
    }
  }

  function pick(result) {
    onFlyTo(result.lat, result.lon, 12)
    setResults([])
    setQuery(result.displayName.split(',')[0])
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
            setQuery(e.target.value)
            setError('')
            setResults([])
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
                if (e.key === 'Enter') pick(r)
              }}
            >
              {r.displayName}
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
