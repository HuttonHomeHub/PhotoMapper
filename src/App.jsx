import { useState, useRef, useMemo, useEffect } from 'react'
import React from 'react'
import { useFocusTrap } from './hooks/useFocusTrap.js'

function SidebarSection({ title, defaultOpen = true, badge = null, children }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const prevDefaultOpen = React.useRef(defaultOpen)
  React.useEffect(() => {
    if (prevDefaultOpen.current !== defaultOpen) {
      setOpen(defaultOpen)
      prevDefaultOpen.current = defaultOpen
    }
  }, [defaultOpen])
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
import { useClients } from './hooks/useClients.js'
import { useProjects } from './hooks/useProjects.js'
import { PhotoMap } from './components/PhotoMap.jsx'
import { PhotoList } from './components/PhotoList.jsx'
import { PhotoLightbox } from './components/PhotoLightbox.jsx'
import { UploadDrawer } from './components/UploadDrawer.jsx'
import { DropZone } from './components/DropZone.jsx'
import { ElevationProfile } from './components/ElevationProfile.jsx'
import ClientPanel from './components/ClientPanel.jsx'
import { LocationSearch } from './components/LocationSearch.jsx'
import { TimelinePanel } from './components/TimelinePanel.jsx'
import { FilterChips } from './components/FilterChips.jsx'
import { useTimeline } from './hooks/useTimeline.js'
import { filterPhotos } from './lib/filterPhotos.js'
import PhotoComparison from './components/PhotoComparison.jsx'
import { useToast } from './components/Toast.jsx'

const TODAY = new Date().toISOString().slice(0, 10)
const dateToMs = d => new Date(d + 'T12:00:00Z').getTime()
const msToDate = ms => new Date(ms).toISOString().slice(0, 10)

export function App() {
  const { toast } = useToast()
  const {
    photos, loading, error, refresh, deletePhoto, updatePhoto, exportPhotos,
    batchUpdate, batchDelete
  } = usePhotos()
  const { clients, refresh: refreshClients, updateClient, deleteClient } = useClients()
  const { projects, refresh: refreshProjects, updateProject, deleteProject } = useProjects({
    onPhotosChanged: refresh
  })

  function refreshAll() {
    return Promise.all([refresh(), refreshProjects().catch(() => {}), refreshClients().catch(() => {})])
  }

  const minDate = useMemo(() => {
    const dates = photos.map(p => p.dateTaken?.slice(0, 10)).filter(Boolean)
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : ''
  }, [photos])

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userTouchedFilter, setUserTouchedFilter] = useState(false)
  const [results, setResults] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(true)
  const [viewingPhoto, setViewingPhoto] = useState(null)
  const [mapBounds, setMapBounds] = useState(null)
  const [activeTag, setActiveTag] = useState(null)
  const [regionPolygon, setRegionPolygon] = useState(null)
  const [elevationOpen, setElevationOpen] = useState(false)
  const [hoveredPhotoId, setHoveredPhotoId] = useState(null)
  const [activeClientId, setActiveClientId] = useState(null)
  const [activeSurveyDate, setActiveSurveyDate] = useState(null)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(new Set())
  const [comparingPhotoId, setComparingPhotoId] = useState(null)
  const [comparisonPair, setComparisonPair] = useState(null)
  const mapRef = useRef(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const [resetConfirm, setResetConfirm] = React.useState(false)
  const shortcutsTrapRef = useFocusTrap(shortcutsOpen)

  // Timeline playback (state + effects live in the useTimeline hook)
  const timeline = useTimeline(photos)

  useEffect(() => {
    if (!loading && photos.length > 0) setUploadOpen(false)
  }, [loading, photos.length])

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

  // PERF-05: memoize the (formerly inline, per-render) filter chain.
  const filteredPhotos = useMemo(
    () => filterPhotos(photos, {
      dateFrom, dateTo, mapBounds, activeTag, regionPolygon,
      activeSurveyDate, activeProjectId, activeClientId,
    }, projects),
    [photos, dateFrom, dateTo, mapBounds, activeTag, regionPolygon,
     activeSurveyDate, activeProjectId, activeClientId, projects]
  )

  // Fit map to relevant photos when hierarchy selection changes
  useEffect(() => {
    if (!activeClientId && !activeProjectId && !activeSurveyDate) return
    const relevant = photos.filter(p => {
      if (!p.hasGps || p.lat == null || p.lng == null) return false
      if (activeProjectId && p.projectId !== activeProjectId) return false
      if (activeSurveyDate === 'undated' && p.surveyDate != null) return false
      if (activeSurveyDate && activeSurveyDate !== 'undated' && p.surveyDate !== activeSurveyDate) return false
      if (activeClientId) {
        const proj = projects.find(pr => pr.id === p.projectId)
        if (proj?.clientId !== activeClientId) return false
      }
      return true
    })
    if (relevant.length) mapRef.current?.fitToBounds(relevant)
  }, [activeClientId, activeProjectId, activeSurveyDate, photos, projects])

  const { active: timelineActive, setPlaying: setTimelinePlaying } = timeline
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
  }, [shortcutsOpen, timelineActive, setTimelinePlaying])

  const displayPhotos = timeline.active ? timeline.slicePhotos : filteredPhotos
  const displayGpsCount = displayPhotos.filter(p => p.hasGps).length

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

  function clearAllFilters() {
    setUserTouchedFilter(false)
    setActiveTag(null)
    setRegionPolygon(null)
    setActiveClientId(null)
    setActiveProjectId(null)
    setActiveSurveyDate(null)
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
          <div className="sidebar-header-top">
            <svg className="brand-logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="panelMid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2a4a80"/>
                  <stop offset="100%" stopColor="#162d60"/>
                </linearGradient>
                <linearGradient id="panelLeft" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0e1c3a"/>
                  <stop offset="100%" stopColor="#1a3060"/>
                </linearGradient>
                <linearGradient id="panelRight" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1a3060"/>
                  <stop offset="100%" stopColor="#0e1c3a"/>
                </linearGradient>
                <linearGradient id="pinGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffb060"/>
                  <stop offset="100%" stopColor="#c85a10"/>
                </linearGradient>
                <filter id="pinGlow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="1.2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="mapShadow">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.55"/>
                </filter>
              </defs>

              {/* ── Folded paper map — 3 panels ── */}
              <g filter="url(#mapShadow)">
                {/* Left panel — angled back, darker */}
                <polygon points="2,10 16,6 16,38 2,34" fill="url(#panelLeft)" stroke="#3a5c94" strokeWidth="0.8" strokeLinejoin="round"/>
                {/* Centre panel — faces viewer, brightest */}
                <polygon points="16,6 32,6 32,38 16,38" fill="url(#panelMid)" stroke="#3a5c94" strokeWidth="0.8" strokeLinejoin="round"/>
                {/* Right panel — angled back, darker */}
                <polygon points="32,6 46,10 46,34 32,38" fill="url(#panelRight)" stroke="#3a5c94" strokeWidth="0.8" strokeLinejoin="round"/>
              </g>

              {/* Centre panel detail — horizontal map lines */}
              <line x1="16" y1="14" x2="32" y2="14" stroke="#4a72b0" strokeWidth="0.5" strokeOpacity="0.6"/>
              <line x1="16" y1="22" x2="32" y2="22" stroke="#4a72b0" strokeWidth="0.5" strokeOpacity="0.6"/>
              <line x1="16" y1="30" x2="32" y2="30" stroke="#4a72b0" strokeWidth="0.5" strokeOpacity="0.6"/>
              {/* Centre panel — vertical divider */}
              <line x1="24" y1="6" x2="24" y2="38" stroke="#4a72b0" strokeWidth="0.4" strokeOpacity="0.35"/>

              {/* Left panel detail — perspective lines */}
              <line x1="2" y1="16" x2="16" y2="14" stroke="#3a5c94" strokeWidth="0.4" strokeOpacity="0.5"/>
              <line x1="2" y1="24" x2="16" y2="22" stroke="#3a5c94" strokeWidth="0.4" strokeOpacity="0.5"/>
              <line x1="2" y1="30" x2="16" y2="30" stroke="#3a5c94" strokeWidth="0.4" strokeOpacity="0.4"/>

              {/* Right panel detail — perspective lines */}
              <line x1="32" y1="14" x2="46" y2="16" stroke="#3a5c94" strokeWidth="0.4" strokeOpacity="0.5"/>
              <line x1="32" y1="22" x2="46" y2="24" stroke="#3a5c94" strokeWidth="0.4" strokeOpacity="0.5"/>
              <line x1="32" y1="30" x2="46" y2="30" stroke="#3a5c94" strokeWidth="0.4" strokeOpacity="0.4"/>

              {/* Route squiggle on centre panel */}
              <path d="M17 33 Q20 28 23 30 Q25 31 27 28 Q29 25 31 27" stroke="#e97b25" strokeWidth="0.9" strokeOpacity="0.5" strokeLinecap="round" fill="none"/>

              {/* ── Pin ── */}
              <ellipse cx="24" cy="34" rx="3" ry="1.2" fill="#e97b25" fillOpacity="0.2"/>
              <path d="M24 9 C21.2 9 19 11.2 19 14.2 C19 18.2 24 25 24 25 C24 25 29 18.2 29 14.2 C29 11.2 26.8 9 24 9 Z"
                fill="url(#pinGrad)" filter="url(#pinGlow)"/>
              <path d="M21.5 11.2 C20.4 12.4 19.8 13.7 19.8 14.8" stroke="white" strokeWidth="0.9" strokeOpacity="0.4" strokeLinecap="round"/>
              <circle cx="24" cy="14.2" r="3.2" fill="#1a1a2e" stroke="#ffb060" strokeWidth="0.7"/>
              <circle cx="24" cy="14.2" r="1.8" fill="#0a0f22"/>
              <circle cx="23.1" cy="13.3" r="0.65" fill="white" fillOpacity="0.6"/>
            </svg>
            <div className="sidebar-header-text">
              <h1>Photo<span className="brand-accent">Map</span></h1>
              <p>Upload photos and explore them on an interactive map</p>
            </div>
          </div>
        </div>

        {error && <div className="error-banner">Failed to load photos. Please refresh.</div>}

        {photos.length === 0 && !loading ? (
          <>
            <div className="sidebar-empty-state">
              <DropZone
                onUploadComplete={refreshAll}
                setResults={setResults}
                openDrawer={() => setDrawerOpen(true)}
                clients={clients}
                projects={projects}
                activeProjectId={activeProjectId}
              />
            </div>
            <div className="sidebar-footer">
              <div className="sidebar-footer-row">
                <button
                  className={`footer-btn footer-btn--log${drawerOpen ? ' active' : ''}`}
                  onClick={() => setDrawerOpen(o => !o)}
                  title="Upload log"
                  aria-label="Toggle upload log"
                >
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/>
                    <rect x="2" y="7" width="8" height="2" rx="1" fill="currentColor"/>
                    <rect x="2" y="11" width="10" height="2" rx="1" fill="currentColor"/>
                  </svg>
                  Log
                  {results.length > 0 && !drawerOpen && <span className="log-toggle-dot" />}
                </button>
                <button
                  className="footer-btn footer-btn--help"
                  onClick={() => setShortcutsOpen(true)}
                  title="Keyboard shortcuts"
                  aria-label="Show keyboard shortcuts"
                >
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M6 6.2C6 5 6.9 4.2 8 4.2s2 .8 2 1.8c0 1.2-2 1.8-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
        <div className="sidebar-tab-panel sidebar-tab-panel--browse">
            <SidebarSection title="Navigation tree">
            <ClientPanel
              clients={clients}
              projects={projects}
              photos={photos}
              activeClientId={activeClientId}
              activeProjectId={activeProjectId}
              activeSurveyDate={activeSurveyDate}
              onSelectClient={id => { setActiveClientId(id); setActiveProjectId(null); setActiveSurveyDate(null) }}
              onSelectProject={id => { setActiveProjectId(id); setActiveSurveyDate(null) }}
              onSelectSurveyDate={setActiveSurveyDate}
              onUpdateClient={updateClient}
              onDeleteClient={deleteClient}
              onUpdateProject={updateProject}
              onDeleteProject={deleteProject}
            />
            </SidebarSection>
            <SidebarSection title="Photos" badge={displayPhotos.length > 0 ? (
              <span
                title={displayGpsCount === displayPhotos.length
                  ? `${displayPhotos.length} photos · all have GPS`
                  : `${displayPhotos.length} photos · ${displayGpsCount} mapped · ${displayPhotos.length - displayGpsCount} missing GPS`}
                style={displayGpsCount < displayPhotos.length ? { color: 'var(--color-warning)' } : {}}
              >
                {displayGpsCount < displayPhotos.length ? `📍 ${displayGpsCount}/${displayPhotos.length}` : `📍 ${displayPhotos.length}`}
              </span>
            ) : null}>
            <FilterChips
              isFiltered={isFiltered}
              activeTag={activeTag}
              regionPolygon={regionPolygon}
              activeClientId={activeClientId}
              activeProjectId={activeProjectId}
              activeSurveyDate={activeSurveyDate}
              clients={clients}
              projects={projects}
              onClearDate={() => setUserTouchedFilter(false)}
              onClearTag={() => setActiveTag(null)}
              onClearRegion={() => setRegionPolygon(null)}
              onClearClient={() => { setActiveClientId(null); setActiveProjectId(null); setActiveSurveyDate(null) }}
              onClearProject={() => { setActiveProjectId(null); setActiveSurveyDate(null) }}
              onClearSurvey={() => setActiveSurveyDate(null)}
              onClearAll={clearAllFilters}
            />

            <PhotoList
              photos={displayPhotos}
              totalCount={photos.length}
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
              comparingPhotoId={comparingPhotoId}
              onCompareClick={handleCompareClick}
              toast={toast}
              hasActiveFilters={!!(isFiltered || activeTag || regionPolygon || activeClientId || activeSurveyDate || activeProjectId)}
              timelinePhotoId={timeline.active ? timeline.currentPhoto?.id : null}
              onClearAllFilters={clearAllFilters}
            />
            </SidebarSection>
            <SidebarSection title="Search" defaultOpen={!activeSurveyDate}>
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
                {isFiltered && (
                  <button className="date-filter-clear" onClick={() => setUserTouchedFilter(false)}>
                    Reset range
                  </button>
                )}
              </>
            ) : (
              <>
                {isFiltered && (
                  <button className="date-filter-clear" onClick={() => setUserTouchedFilter(false)}>
                    Reset range
                  </button>
                )}
              </>
            )}
          </div>

          <LocationSearch onFlyTo={(lat, lng, zoom) => mapRef.current?.flyTo(lat, lng, zoom)} />


        </SidebarSection>

        {/* Timeline Player */}
        <SidebarSection title="Timeline" defaultOpen={false}>
          <TimelinePanel timeline={timeline} photoCount={photos.length} />
        </SidebarSection>

        </div>
        <div className="sidebar-footer">
          {uploadOpen && (
            <div className="sidebar-upload-tray">
              <DropZone
                onUploadComplete={refreshAll}
                setResults={setResults}
                openDrawer={() => setDrawerOpen(true)}
                clients={clients}
                projects={projects}
                activeProjectId={activeProjectId}
              />
            </div>
          )}
          <div className="sidebar-footer-row">
            <button
              className={`footer-btn footer-btn--upload${uploadOpen ? ' active' : ''}`}
              onClick={() => setUploadOpen(o => !o)}
              title={uploadOpen ? 'Close upload' : 'Upload photos'}
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                {uploadOpen
                  ? <path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  : <><path d="M8 3v10M8 3L5 6M8 3l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></>
                }
              </svg>
              Upload Photos
            </button>
            <button
              className={`footer-btn footer-btn--log${drawerOpen ? ' active' : ''}`}
              onClick={() => setDrawerOpen(o => !o)}
              title="Upload log"
              aria-label="Toggle upload log"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/>
                <rect x="2" y="7" width="8" height="2" rx="1" fill="currentColor"/>
                <rect x="2" y="11" width="10" height="2" rx="1" fill="currentColor"/>
              </svg>
              Log
              {results.length > 0 && !drawerOpen && <span className="log-toggle-dot" />}
            </button>
            <button
              className="footer-btn footer-btn--help"
              onClick={() => setShortcutsOpen(true)}
              title="Keyboard shortcuts"
              aria-label="Show keyboard shortcuts"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 6.2C6 5 6.9 4.2 8 4.2s2 .8 2 1.8c0 1.2-2 1.8-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
          </>
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
          onBoundsChange={setMapBounds}
          exportPhotos={exportPhotos}
          hasGps={photos.some(p => p.hasGps)}
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

      <UploadDrawer
        results={results}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onClear={() => setResults([])}
        onAllDone={() => setDrawerOpen(false)}
      />

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
            <div className="shortcuts-reset">
              {resetConfirm ? (
                <>
                  <span className="shortcuts-reset-warning">This will delete all photos, clients and projects.</span>
                  <div className="shortcuts-reset-actions">
                    <button className="shortcuts-reset-confirm" onClick={async () => {
                      await fetch('/api/reset', { method: 'DELETE' })
                      setResetConfirm(false)
                      setShortcutsOpen(false)
                      refreshAll()
                    }}>Yes, wipe everything</button>
                    <button className="shortcuts-reset-cancel" onClick={() => setResetConfirm(false)}>Cancel</button>
                  </div>
                </>
              ) : (
                <button className="shortcuts-reset-btn" onClick={() => setResetConfirm(true)}>Reset all data…</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
