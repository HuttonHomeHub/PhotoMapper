import { useState, useRef, useMemo, useEffect } from 'react'
import { usePhotos } from './hooks/usePhotos.js'
import { DropZone } from './components/DropZone.jsx'
import { PhotoMap } from './components/PhotoMap.jsx'
import { PhotoList } from './components/PhotoList.jsx'
import { PhotoLightbox } from './components/PhotoLightbox.jsx'
import { UploadDrawer } from './components/UploadDrawer.jsx'

const TODAY = new Date().toISOString().slice(0, 10)
const dateToMs = d => new Date(d + 'T12:00:00Z').getTime()
const msToDate = ms => new Date(ms).toISOString().slice(0, 10)

export function App() {
  const { photos, loading, error, refresh, deletePhoto } = usePhotos()
  const gpsCount = photos.filter(p => p.hasGps).length

  const minDate = useMemo(() => {
    const dates = photos.map(p => p.dateTaken?.slice(0, 10)).filter(Boolean)
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : ''
  }, [photos])

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userTouchedFilter, setUserTouchedFilter] = useState(false)
  const [results, setResults] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewingPhoto, setViewingPhoto] = useState(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSearching, setLocationSearching] = useState(false)
  const [mapBounds, setMapBounds] = useState(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!userTouchedFilter) {
      setDateFrom(minDate || '')
      setDateTo(minDate ? TODAY : '')
    }
  }, [minDate, userTouchedFilter])

  const minTs = minDate ? dateToMs(minDate) : 0
  const maxTs = dateToMs(TODAY)
  const fromTs = dateFrom ? dateToMs(dateFrom) : minTs
  const toTs = dateTo ? dateToMs(dateTo) : maxTs
  const sliderRange = maxTs - minTs
  const fromPct = sliderRange > 0 ? ((fromTs - minTs) / sliderRange) * 100 : 0
  const toPct = sliderRange > 0 ? ((toTs - minTs) / sliderRange) * 100 : 100

  const isFiltered = minDate
    ? (dateFrom !== minDate || dateTo !== TODAY)
    : Boolean(dateFrom || dateTo)

  const filteredPhotos = photos.filter(p => {
    if (dateFrom || dateTo) {
      if (p.dateTaken) {
        const date = p.dateTaken.slice(0, 10)
        if (dateFrom && date < dateFrom) return false
        if (dateTo && date > dateTo) return false
      }
    }
    if (mapBounds && p.hasGps && p.lat != null && p.lng != null) {
      if (p.lat < mapBounds.south || p.lat > mapBounds.north) return false
      if (p.lng < mapBounds.west || p.lng > mapBounds.east) return false
    }
    return true
  })

  async function handleLocationSearch(e) {
    e.preventDefault()
    if (!locationQuery.trim()) return
    setLocationSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(locationQuery)}`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const results = await res.json()
      if (results.length > 0) {
        mapRef.current?.flyTo(parseFloat(results[0].lat), parseFloat(results[0].lon), 12)
      }
    } finally {
      setLocationSearching(false)
    }
  }

  function handleFilterToView() {
    const bounds = mapRef.current?.getBounds()
    if (!bounds) return
    setMapBounds({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    })
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-text">
            <h1>Photo Map</h1>
            <p>Upload photos with GPS EXIF data</p>
          </div>
          <button
            className={`log-toggle-btn${drawerOpen ? ' active' : ''}`}
            onClick={() => setDrawerOpen(o => !o)}
          >
            Log
            {results.length > 0 && !drawerOpen && <span className="log-toggle-dot" />}
          </button>
        </div>

        {error && <div className="error-banner">Failed to load photos. Please refresh.</div>}

        <DropZone onUploadComplete={refresh} setResults={setResults} openDrawer={() => setDrawerOpen(true)} />

        {!loading && (
          <div className="photo-count">
            {gpsCount} photo{gpsCount !== 1 ? 's' : ''} on map
            {photos.length > gpsCount ? ` · ${photos.length - gpsCount} without GPS` : ''}
          </div>
        )}

        <div className="date-filter">
          <div className="date-filter-row">
            <label className="date-filter-label">
              From
              <input
                type="date"
                className="date-filter-input"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setUserTouchedFilter(true) }}
              />
            </label>
            <label className="date-filter-label">
              To
              <input
                type="date"
                className="date-filter-input"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setUserTouchedFilter(true) }}
              />
            </label>
          </div>
          {minDate && sliderRange > 0 && (
            <div className="date-slider-wrap">
              <div
                className="date-slider-track"
                style={{
                  background: `linear-gradient(to right, #0f3460 ${fromPct}%, #e94560 ${fromPct}%, #e94560 ${toPct}%, #0f3460 ${toPct}%)`
                }}
              >
                <input
                  type="range"
                  className="date-range-input"
                  min={minTs}
                  max={maxTs}
                  value={fromTs}
                  style={{ zIndex: fromTs >= toTs ? 3 : 1 }}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (v <= toTs) { setDateFrom(msToDate(v)); setUserTouchedFilter(true) }
                  }}
                />
                <input
                  type="range"
                  className="date-range-input"
                  min={minTs}
                  max={maxTs}
                  value={toTs}
                  style={{ zIndex: toTs <= fromTs ? 3 : 1 }}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (v >= fromTs) { setDateTo(msToDate(v)); setUserTouchedFilter(true) }
                  }}
                />
              </div>
            </div>
          )}
          {isFiltered && (
            <button className="date-filter-clear" onClick={() => setUserTouchedFilter(false)}>
              Reset range
            </button>
          )}
        </div>

        <form className="location-search" onSubmit={handleLocationSearch}>
          <input
            type="text"
            className="location-search-input"
            placeholder="Search location…"
            value={locationQuery}
            onChange={e => setLocationQuery(e.target.value)}
          />
          <button type="submit" className="location-search-btn" disabled={locationSearching}>
            {locationSearching ? '…' : 'Go'}
          </button>
        </form>

        <div className="map-filter-row">
          <button className="map-filter-btn" onClick={handleFilterToView}>
            Filter to map view
          </button>
          {mapBounds && (
            <button className="date-filter-clear" onClick={() => setMapBounds(null)}>
              Clear
            </button>
          )}
        </div>

        <PhotoList photos={filteredPhotos} onDelete={deletePhoto} onView={setViewingPhoto} />
      </aside>

      <PhotoMap ref={mapRef} photos={filteredPhotos} onDelete={deletePhoto} onView={setViewingPhoto} />

      <UploadDrawer results={results} open={drawerOpen} onClose={() => setDrawerOpen(false)} onClear={() => setResults([])} />

      {viewingPhoto && (
        <PhotoLightbox
          photo={viewingPhoto}
          photos={filteredPhotos}
          onClose={setViewingPhoto}
        />
      )}
    </div>
  )
}
