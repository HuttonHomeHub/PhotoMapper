import { useState, useRef, useMemo, useEffect } from 'react'
import { usePhotos } from './hooks/usePhotos.js'
import { DropZone } from './components/DropZone.jsx'
import { PhotoMap } from './components/PhotoMap.jsx'
import { PhotoList } from './components/PhotoList.jsx'
import { PhotoLightbox } from './components/PhotoLightbox.jsx'
import { UploadDrawer } from './components/UploadDrawer.jsx'
import { ElevationProfile } from './components/ElevationProfile.jsx'
import CollectionPanel from './components/CollectionPanel.jsx'
import ProjectPanel from './components/ProjectPanel.jsx'
import PhotoComparison from './components/PhotoComparison.jsx'

const TODAY = new Date().toISOString().slice(0, 10)
const dateToMs = d => new Date(d + 'T12:00:00Z').getTime()
const msToDate = ms => new Date(ms).toISOString().slice(0, 10)

// Ray-casting point-in-polygon; polygon is array of {lat, lng}
function pointInPolygon([lat, lng], polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

export function App() {
  const {
    photos, loading, error, refresh, deletePhoto, updatePhoto, exportPhotos,
    collections, createCollection, updateCollection, deleteCollection,
    addPhotosToCollection, removePhotoFromCollection, batchUpdate, batchDelete,
    projects, createProject, updateProject, deleteProject, assignToProject
  } = usePhotos()
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
  const [activeTag, setActiveTag] = useState(null)
  const [regionPolygon, setRegionPolygon] = useState(null)
  const [elevationOpen, setElevationOpen] = useState(false)
  const [hoveredPhotoId, setHoveredPhotoId] = useState(null)
  const [activeCollectionId, setActiveCollectionId] = useState(null)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(new Set())
  const [comparingPhotoId, setComparingPhotoId] = useState(null)
  const [comparisonPair, setComparisonPair] = useState(null)
  const mapRef = useRef(null)

  // Timeline state
  const [timelineActive, setTimelineActive] = useState(false)
  const [timelineIndex, setTimelineIndex] = useState(0)
  const [timelinePlaying, setTimelinePlaying] = useState(false)
  const [timelineSpeed, setTimelineSpeed] = useState(800)

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
    if (activeTag) {
      if (!p.tags?.includes(activeTag)) return false
    }
    if (regionPolygon && p.hasGps && p.lat != null && p.lng != null) {
      if (!pointInPolygon([p.lat, p.lng], regionPolygon)) return false
    }
    return true
  }).filter(p => !activeCollectionId || (p.collectionIds && p.collectionIds.includes(activeCollectionId)))
    .filter(p => !activeProjectId || p.projectId === activeProjectId)

  // Timeline: all photos sorted by date for chronological playback
  const timelineSorted = useMemo(() =>
    [...photos].sort((a, b) => {
      const dateA = a.dateTaken || a.uploadedAt || ''
      const dateB = b.dateTaken || b.uploadedAt || ''
      return dateA.localeCompare(dateB)
    }),
  [photos])

  // Reset timeline when activated
  useEffect(() => {
    if (timelineActive) {
      setTimelineIndex(0)
      setTimelinePlaying(false)
    }
  }, [timelineActive])

  // Timeline auto-advance
  useEffect(() => {
    if (!timelinePlaying) return
    if (timelineIndex >= timelineSorted.length - 1) {
      setTimelinePlaying(false)
      return
    }
    const timer = setTimeout(() => setTimelineIndex(i => i + 1), timelineSpeed)
    return () => clearTimeout(timer)
  }, [timelinePlaying, timelineIndex, timelineSorted.length, timelineSpeed])

  const timelineSlicePhotos = timelineSorted.slice(0, timelineIndex + 1)
  const currentTimelinePhoto = timelineSorted[timelineIndex]
  const currentTimelineDate = currentTimelinePhoto
    ? (currentTimelinePhoto.dateTaken
        ? new Date(currentTimelinePhoto.dateTaken).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : `Photo ${timelineIndex + 1}`)
    : ''

  const displayPhotos = timelineActive ? timelineSlicePhotos : filteredPhotos

  function togglePhotoSelection(id) {
    setSelectedPhotoIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedPhotoIds(new Set())
    setSelectionMode(false)
  }

  function handleCompareClick(photoId) {
    if (!comparingPhotoId) {
      setComparingPhotoId(photoId)
    } else if (comparingPhotoId === photoId) {
      setComparingPhotoId(null)
    } else {
      setComparisonPair([comparingPhotoId, photoId])
      setComparingPhotoId(null)
    }
  }

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

        <DropZone onUploadComplete={refresh} setResults={setResults} openDrawer={() => setDrawerOpen(true)} projects={projects} activeProjectId={activeProjectId} />

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

        {activeTag && (
          <div className="map-filter-row">
            <span className="active-tag-label">Tag: <strong>{activeTag}</strong></span>
            <button className="date-filter-clear" onClick={() => setActiveTag(null)}>
              Clear
            </button>
          </div>
        )}

        <div className="export-row">
          <button className="export-btn" onClick={() => exportPhotos('geojson')} disabled={photos.filter(p => p.hasGps).length === 0}>
            ↓ GeoJSON
          </button>
          <button className="export-btn" onClick={() => exportPhotos('kml')} disabled={photos.filter(p => p.hasGps).length === 0}>
            ↓ KML
          </button>
        </div>

        {/* Timeline Player */}
        <div className="timeline-section">
          <button
            className={`timeline-toggle-btn${timelineActive ? ' active' : ''}`}
            onClick={() => setTimelineActive(a => !a)}
            disabled={photos.length === 0}
          >
            {timelineActive ? '✕ Exit Timeline' : '▷ Timeline'}
          </button>
          {timelineActive && (
            <div className="timeline-controls">
              <div className="timeline-label">
                {currentTimelineDate}
                <span className="timeline-counter">{timelineIndex + 1} / {timelineSorted.length}</span>
              </div>
              <input
                type="range"
                className="timeline-scrubber"
                min={0}
                max={Math.max(0, timelineSorted.length - 1)}
                value={timelineIndex}
                onChange={e => {
                  setTimelineIndex(Number(e.target.value))
                  setTimelinePlaying(false)
                }}
              />
              <div className="timeline-actions">
                <button
                  className="timeline-play-btn"
                  onClick={() => setTimelinePlaying(p => !p)}
                  disabled={timelineSorted.length < 2}
                >
                  {timelinePlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <select
                  className="timeline-speed-select"
                  value={timelineSpeed}
                  onChange={e => setTimelineSpeed(Number(e.target.value))}
                >
                  <option value={1500}>Slow</option>
                  <option value={800}>Normal</option>
                  <option value={300}>Fast</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <ProjectPanel
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={setActiveProjectId}
          onCreate={createProject}
          onUpdate={updateProject}
          onDelete={deleteProject}
        />

        <CollectionPanel
          collections={collections}
          activeCollectionId={activeCollectionId}
          onSelect={setActiveCollectionId}
          onCreate={createCollection}
          onUpdate={updateCollection}
          onDelete={deleteCollection}
        />

        <PhotoList
          photos={displayPhotos}
          onDelete={deletePhoto}
          onView={setViewingPhoto}
          activeTag={activeTag}
          onTagClick={tag => setActiveTag(prev => prev === tag ? null : tag)}
          selectionMode={selectionMode}
          selectedPhotoIds={selectedPhotoIds}
          onToggleSelection={togglePhotoSelection}
          onToggleSelectionMode={() => {
            setSelectionMode(v => !v)
            setSelectedPhotoIds(new Set())
          }}
          onBatchUpdate={batchUpdate}
          onBatchDelete={batchDelete}
          onBatchAddToCollection={addPhotosToCollection}
          collections={collections}
          activeCollectionId={activeCollectionId}
          comparingPhotoId={comparingPhotoId}
          onCompareClick={handleCompareClick}
        />
      </aside>

      <div className="map-panel">
        <PhotoMap
          ref={mapRef}
          photos={displayPhotos}
          onDelete={deletePhoto}
          onView={setViewingPhoto}
          hoveredPhotoId={hoveredPhotoId}
          onPhotoHover={setHoveredPhotoId}
          onRegionChange={setRegionPolygon}
        />
        {elevationOpen && (
          <ElevationProfile
            photos={displayPhotos}
            hoveredPhotoId={hoveredPhotoId}
            onHover={setHoveredPhotoId}
          />
        )}
        {displayPhotos.filter(p => p.hasGps && p.altitude != null).length >= 2 && (
          <button
            className={`elevation-toggle-btn${elevationOpen ? ' active' : ''}`}
            onClick={() => setElevationOpen(o => !o)}
          >
            {elevationOpen ? '▾ Hide Elevation' : '▴ Elevation Profile'}
          </button>
        )}
      </div>

      <UploadDrawer results={results} open={drawerOpen} onClose={() => setDrawerOpen(false)} onClear={() => setResults([])} />

      {viewingPhoto && (
        <PhotoLightbox
          photo={viewingPhoto}
          photos={displayPhotos}
          onClose={setViewingPhoto}
          onUpdate={updatePhoto}
        />
      )}

      {comparisonPair && (
        <PhotoComparison
          photos={photos}
          leftId={comparisonPair[0]}
          rightId={comparisonPair[1]}
          onClose={() => setComparisonPair(null)}
          onChangeLeft={id => setComparisonPair(([, r]) => [id, r])}
          onChangeRight={id => setComparisonPair(([l]) => [l, id])}
        />
      )}
    </div>
  )
}
