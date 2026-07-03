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
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept-Language': 'en' }, signal: controller.signal }
      )
      const data = await res.json()
      if (data.length === 0) {
        setError(`No locations found for "${query}"`)
      } else if (data.length === 1) {
        onFlyTo(parseFloat(data[0].lat), parseFloat(data[0].lon), 12)
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
    onFlyTo(parseFloat(result.lat), parseFloat(result.lon), 12)
    setResults([])
    setQuery(result.display_name.split(',')[0])
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
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
