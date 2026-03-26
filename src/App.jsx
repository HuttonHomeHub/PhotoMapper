import { useState, useRef } from 'react'
import { usePhotos } from './hooks/usePhotos.js'
import { DropZone } from './components/DropZone.jsx'
import { PhotoMap } from './components/PhotoMap.jsx'
import { PhotoList } from './components/PhotoList.jsx'
import { PhotoLightbox } from './components/PhotoLightbox.jsx'

export function App() {
  const { photos, loading, refresh, deletePhoto } = usePhotos()
  const gpsCount = photos.filter(p => p.hasGps).length
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [viewingPhoto, setViewingPhoto] = useState(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSearching, setLocationSearching] = useState(false)
  const [mapBounds, setMapBounds] = useState(null)
  const mapRef = useRef(null)

  const filteredPhotos = photos.filter(p => {
    if (dateFrom || dateTo) {
      if (!p.dateTaken) return false
      const date = p.dateTaken.slice(0, 10)
      if (dateFrom && date < dateFrom) return false
      if (dateTo && date > dateTo) return false
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
          <h1>Photo Map</h1>
          <p>Upload photos with GPS EXIF data</p>
        </div>

        <DropZone onUploadComplete={refresh} />

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
                onChange={e => setDateFrom(e.target.value)}
              />
            </label>
            <label className="date-filter-label">
              To
              <input
                type="date"
                className="date-filter-input"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </label>
          </div>
          {(dateFrom || dateTo) && (
            <button className="date-filter-clear" onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Clear filter
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
