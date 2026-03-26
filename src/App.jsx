import { useState, useRef, useMemo, useEffect } from 'react'
import React from 'react'
import { useFocusTrap } from './hooks/useFocusTrap.js'

function SidebarSection({ title, defaultOpen = true, badge = null, children }) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div className="sidebar-section">
      <button
        className="sidebar-section-header"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className="sidebar-section-title">{title}</span>
        {badge && <span className="sidebar-section-badge">{badge}</span>}
        <span className="sidebar-section-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <div className="sidebar-section-body">{children}</div>}
    </div>
  )
}
import { usePhotos } from './hooks/usePhotos.js'
import { DropZone } from './components/DropZone.jsx'
import { PhotoMap } from './components/PhotoMap.jsx'
import { PhotoList } from './components/PhotoList.jsx'
import { PhotoLightbox } from './components/PhotoLightbox.jsx'
import { UploadDrawer } from './components/UploadDrawer.jsx'
import { ElevationProfile } from './components/ElevationProfile.jsx'
import ClientPanel from './components/ClientPanel.jsx'
import PhotoComparison from './components/PhotoComparison.jsx'
import { ToastContainer, useToast } from './components/Toast.jsx'

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
  const { toast } = useToast()
  const {
    photos, loading, error, refresh, refreshAll, deletePhoto, updatePhoto, exportPhotos,
    clients, createClient, updateClient, deleteClient,
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
  const [locationResults, setLocationResults] = useState([])
  const [locationError, setLocationError] = useState('')
  const locationAbortRef = useRef(null)
  const [mapBounds, setMapBounds] = useState(null)
  const [activeTag, setActiveTag] = useState(null)
  const [regionPolygon, setRegionPolygon] = useState(null)
  const [elevationOpen, setElevationOpen] = useState(false)
  const [hoveredPhotoId, setHoveredPhotoId] = useState(null)
  const [activeClientId, setActiveClientId] = useState(null)
  const [activeCollectionId, setActiveCollectionId] = useState(null)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(new Set())
  const [comparingPhotoId, setComparingPhotoId] = useState(null)
  const [comparisonPair, setComparisonPair] = useState(null)
  const mapRef = useRef(null)
  const [sidebarTab, setSidebarTab] = useState('organise')
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const shortcutsTrapRef = useFocusTrap(shortcutsOpen)

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
    .filter(p => {
      if (!activeClientId) return true
      const proj = projects.find(pr => pr.id === p.projectId)
      return proj?.clientId === activeClientId
    })

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

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === '?') setShortcutsOpen(v => !v)
      if (e.key === 'Escape' && shortcutsOpen) setShortcutsOpen(false)
      if (e.key === ' ' && timelineActive) {
        e.preventDefault()
        setTimelinePlaying(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutsOpen, timelineActive])

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
    locationAbortRef.current?.abort()
    const controller = new AbortController()
    locationAbortRef.current = controller
    setLocationSearching(true)
    setLocationError('')
    setLocationResults([])
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(locationQuery)}`,
        { headers: { 'Accept-Language': 'en' }, signal: controller.signal }
      )
      const data = await res.json()
      if (data.length === 0) {
        setLocationError(`No locations found for "${locationQuery}"`)
      } else if (data.length === 1) {
        mapRef.current?.flyTo(parseFloat(data[0].lat), parseFloat(data[0].lon), 12)
      } else {
        setLocationResults(data)
      }
    } catch (err) {
      if (err.name !== 'AbortError') setLocationError('Location search failed. Try again.')
    } finally {
      setLocationSearching(false)
    }
  }

  function handlePickLocation(result) {
    mapRef.current?.flyTo(parseFloat(result.lat), parseFloat(result.lon), 12)
    setLocationResults([])
    setLocationQuery(result.display_name.split(',')[0])
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
      <button
        className="mobile-sidebar-toggle"
        onClick={() => setMobileSidebarOpen(v => !v)}
        aria-label="Toggle sidebar"
      >
        ☰
      </button>

      {mobileSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar${mobileSidebarOpen ? ' mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-text">
            <h1>Photo<span className="brand-accent">Map</span></h1>
            <p>GPS photo mapping</p>
          </div>
          <button
            className={`log-toggle-btn${drawerOpen ? ' active' : ''}`}
            onClick={() => setDrawerOpen(o => !o)}
          >
            Uploads
            {results.length > 0 && !drawerOpen && <span className="log-toggle-dot" />}
          </button>
          <button
            className="shortcuts-hint-btn"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts"
            aria-label="Show keyboard shortcuts"
          >?</button>
        </div>

        {error && <div className="error-banner">Failed to load photos. Please refresh.</div>}

        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab-btn${sidebarTab === 'organise' ? ' active' : ''}`}
            onClick={() => setSidebarTab('organise')}
          >
            Organise
          </button>
          <button
            className={`sidebar-tab-btn${sidebarTab === 'browse' ? ' active' : ''}`}
            onClick={() => setSidebarTab('browse')}
          >
            Browse
            {(isFiltered || mapBounds || activeTag || regionPolygon || activeClientId || activeCollectionId || activeProjectId) && (
              <span className="sidebar-tab-dot" />
            )}
          </button>
        </div>

        {sidebarTab === 'organise' && (
          <div className="sidebar-tab-panel">
            <DropZone
              onUploadComplete={() => { refreshAll(); setSidebarTab('browse') }}
              setResults={setResults}
              openDrawer={() => setDrawerOpen(true)}
              clients={clients}
              projects={projects}
              activeProjectId={activeProjectId}
            />

            {!loading && photos.length > 0 && (
              <div className="photo-stat-row">
                <span className="photo-stat-pill">
                  <span className="pill-icon">📍</span>
                  {gpsCount} on map
                </span>
                {photos.length - gpsCount > 0 && (
                  <span className="photo-stat-pill pill-warn">
                    ⚠ {photos.length - gpsCount} no GPS
                  </span>
                )}
              </div>
            )}

            <ClientPanel
              clients={clients}
              projects={projects}
              collections={collections}
              activeClientId={activeClientId}
              activeProjectId={activeProjectId}
              activeCollectionId={activeCollectionId}
              onSelectClient={id => { setActiveClientId(id); setActiveProjectId(null); setActiveCollectionId(null) }}
              onSelectProject={id => { setActiveProjectId(id); setActiveCollectionId(null) }}
              onSelectCollection={setActiveCollectionId}
              onCreateClient={createClient}
              onUpdateClient={updateClient}
              onDeleteClient={deleteClient}
              onCreateProject={createProject}
              onUpdateProject={updateProject}
              onDeleteProject={deleteProject}
              onCreateCollection={createCollection}
              onUpdateCollection={updateCollection}
              onDeleteCollection={deleteCollection}
            />
          </div>
        )}

        {sidebarTab === 'browse' && (
          <div className="sidebar-tab-panel sidebar-tab-panel--browse">
            <SidebarSection title="Filters" defaultOpen={true}>
          <div className="date-filter">
            {minDate && sliderRange > 0 ? (
              <>
                <div className="date-range-display">
                  <span>{dateFrom || minDate || 'earliest'}</span>
                  <span className="date-range-sep">→</span>
                  <span>{dateTo || TODAY || 'latest'}</span>
                </div>
                <div className="date-slider-wrap">
                  <div
                    className="date-slider-track"
                    style={{
                      background: `linear-gradient(to right, #0f3460 ${fromPct}%, #e97b25 ${fromPct}%, #e97b25 ${toPct}%, #0f3460 ${toPct}%)`
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
                <details className="date-filter-advanced">
                  <summary>Precise dates ›</summary>
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
                </details>
                {isFiltered && (
                  <button className="date-filter-clear" onClick={() => setUserTouchedFilter(false)}>
                    Reset range
                  </button>
                )}
              </>
            ) : (
              <>
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
                {isFiltered && (
                  <button className="date-filter-clear" onClick={() => setUserTouchedFilter(false)}>
                    Reset range
                  </button>
                )}
              </>
            )}
          </div>

          <form className="location-search" onSubmit={handleLocationSearch}>
            <div className="location-search-wrap">
              <input
                type="text"
                className="location-search-input"
                placeholder="Search location…"
                value={locationQuery}
                onChange={e => { setLocationQuery(e.target.value); setLocationError(''); setLocationResults([]) }}
                aria-label="Search for a location"
                aria-autocomplete="list"
              />
              <button type="submit" className="location-search-btn" disabled={locationSearching} aria-label="Search location">
                {locationSearching ? '…' : 'Go'}
              </button>
            </div>
            {locationError && <p className="location-search-error">{locationError}</p>}
            {locationResults.length > 0 && (
              <ul className="location-results-list" role="listbox" aria-label="Location results">
                {locationResults.map((r, i) => (
                  <li
                    key={i}
                    className="location-result-item"
                    role="option"
                    tabIndex={0}
                    onClick={() => handlePickLocation(r)}
                    onKeyDown={e => { if (e.key === 'Enter') handlePickLocation(r) }}
                  >
                    {r.display_name}
                  </li>
                ))}
              </ul>
            )}
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
        </SidebarSection>

        {/* Active filters summary bar — always visible, outside collapsible */}
        {(isFiltered || mapBounds || activeTag || regionPolygon || activeClientId || activeCollectionId || activeProjectId) && (
          <div className="active-filters-bar">
            <div className="active-filters-row">
              <span className="active-filters-label">
                {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''} · filters active:
              </span>
              <button
                className="clear-all-filters-btn"
                onClick={() => {
                  setUserTouchedFilter(false)
                  setMapBounds(null)
                  setActiveTag(null)
                  setRegionPolygon(null)
                  setActiveClientId(null)
                  setActiveProjectId(null)
                  setActiveCollectionId(null)
                }}
              >
                Clear all
              </button>
            </div>
            {isFiltered && (
              <button className="filter-chip" onClick={() => setUserTouchedFilter(false)}>
                📅 Date range ×
              </button>
            )}
            {mapBounds && (
              <button className="filter-chip" onClick={() => setMapBounds(null)}>
                🗺 Map view ×
              </button>
            )}
            {activeTag && (
              <button className="filter-chip" onClick={() => setActiveTag(null)}>
                # {activeTag} ×
              </button>
            )}
            {regionPolygon && (
              <button className="filter-chip" onClick={() => setRegionPolygon(null)}>
                ✏ Region ×
              </button>
            )}
            {activeClientId && (
              <button className="filter-chip" onClick={() => { setActiveClientId(null); setActiveProjectId(null); setActiveCollectionId(null) }}>
                👤 Client ×
              </button>
            )}
            {activeCollectionId && (
              <button className="filter-chip" onClick={() => setActiveCollectionId(null)}>
                ◎ Collection ×
              </button>
            )}
            {activeProjectId && (
              <button className="filter-chip" onClick={() => { setActiveProjectId(null); setActiveCollectionId(null) }}>
                📁 Project ×
              </button>
            )}
          </div>
        )}

        {/* Timeline Player */}
        <SidebarSection title="Timeline" defaultOpen={false}>
          <div className="timeline-section">
            <button
              className={`timeline-toggle-btn${timelineActive ? ' active' : ''}`}
              onClick={() => setTimelineActive(a => !a)}
              disabled={photos.length === 0}
            >
              {timelineActive ? '✕ Exit Timeline' : '▶ Play Timeline'}
            </button>
            {timelineActive && (
              <div className="timeline-controls">
                <div className="timeline-label">
                  <span className="timeline-date">{currentTimelineDate}</span>
                  <span className="timeline-counter">
                    {timelineIndex + 1} <span className="timeline-counter-sep">/</span> {timelineSorted.length}
                  </span>
                </div>
                <input
                  type="range"
                  className="timeline-scrubber"
                  min={0}
                  max={Math.max(0, timelineSorted.length - 1)}
                  value={timelineIndex}
                  aria-label={`Timeline: photo ${timelineIndex + 1} of ${timelineSorted.length}`}
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
                    aria-label={timelinePlaying ? 'Pause timeline' : 'Play timeline (Space)'}
                    title="Space to play/pause"
                  >
                    {timelinePlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <select
                    className="timeline-speed-select"
                    value={timelineSpeed}
                    onChange={e => setTimelineSpeed(Number(e.target.value))}
                    aria-label="Playback speed"
                  >
                    <option value={1500}>Slow</option>
                    <option value={800}>Normal</option>
                    <option value={300}>Fast</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </SidebarSection>

        <PhotoList
          photos={displayPhotos}
          loading={loading}
          onDelete={deletePhoto}
          onView={photo => { setViewingPhoto(photo); setMobileSidebarOpen(false) }}
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
          toast={toast}
          hasActiveFilters={!!(isFiltered || mapBounds || activeTag || regionPolygon || activeClientId || activeCollectionId || activeProjectId)}
          timelinePhotoId={timelineActive ? currentTimelinePhoto?.id : null}
          onClearAllFilters={() => {
            setUserTouchedFilter(false)
            setMapBounds(null)
            setActiveTag(null)
            setRegionPolygon(null)
            setActiveClientId(null)
            setActiveProjectId(null)
            setActiveCollectionId(null)
          }}
        />
          </div>
        )}
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

      <UploadDrawer results={results} open={drawerOpen} onClose={() => setDrawerOpen(false)} onClear={() => setResults([])} onAllDone={() => setDrawerOpen(false)} />

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

      <ToastContainer />

      {shortcutsOpen && (
        <div
          className="shortcuts-overlay"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="shortcuts-box"
            ref={shortcutsTrapRef}
            onClick={e => e.stopPropagation()}
          >
            <div className="shortcuts-header">
              <span>Keyboard Shortcuts</span>
              <button
                className="shortcuts-close"
                onClick={() => setShortcutsOpen(false)}
                aria-label="Close shortcuts"
              >✕</button>
            </div>
            <dl className="shortcuts-list">
              <dt>?</dt><dd>Show / hide this overlay</dd>
              <dt>Esc</dt><dd>Close modal or overlay</dd>
              <dt>← →</dt><dd>Previous / next photo in lightbox</dd>
              <dt>↑ ↓</dt><dd>Navigate photo list</dd>
              <dt>Enter</dt><dd>Open focused photo</dd>
              <dt>Space</dt><dd>Play / pause timeline</dd>
            </dl>
            <p className="shortcuts-hint">Press ? or Esc to close</p>
          </div>
        </div>
      )}
    </div>
  )
}
