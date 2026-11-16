import { useState, useRef, useMemo, useEffect } from 'react';
import React from 'react';
import { AppBar, apiFetch } from '@hhh/ui';
import { MapPinned } from 'lucide-react';
import { useFocusTrap } from './hooks/useFocusTrap.js';

function SidebarSection({ title, defaultOpen = true, badge = null, children }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const prevDefaultOpen = React.useRef(defaultOpen);
  React.useEffect(() => {
    if (prevDefaultOpen.current !== defaultOpen) {
      setOpen(defaultOpen);
      prevDefaultOpen.current = defaultOpen;
    }
  }, [defaultOpen]);
  return (
    <div className="sidebar-section">
      <button
        className="sidebar-section-header"
        onClick={() => setOpen((v) => !v)}
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
  );
}
import { usePhotos } from './hooks/usePhotos.js';
import { useClients } from './hooks/useClients.js';
import { useProjects } from './hooks/useProjects.js';
import { PhotoMap } from './components/PhotoMap.jsx';
import { PhotoList } from './components/PhotoList.jsx';
import { PhotoLightbox } from './components/PhotoLightbox.jsx';
import { UploadDrawer } from './components/UploadDrawer.jsx';
import { DropZone } from './components/DropZone.jsx';
import { ElevationProfile } from './components/ElevationProfile.jsx';
import ClientPanel from './components/ClientPanel.jsx';
import { LocationSearch } from './components/LocationSearch.jsx';
import { TimelinePanel } from './components/TimelinePanel.jsx';
import { FilterChips } from './components/FilterChips.jsx';
import { useTimeline } from './hooks/useTimeline.js';
import { filterPhotos } from './lib/filterPhotos.js';
import PhotoComparison from './components/PhotoComparison.jsx';
import { useToast } from './components/Toast.jsx';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { useAppVersion } from './hooks/useSettings.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';

const TODAY = new Date().toISOString().slice(0, 10);
const dateToMs = (d) => new Date(d + 'T12:00:00Z').getTime();
const msToDate = (ms) => new Date(ms).toISOString().slice(0, 10);

export function App() {
  const { toast } = useToast();
  const {
    photos,
    loading,
    error,
    refresh,
    deletePhoto,
    updatePhoto,
    setPhotoLocation,
    clearPhotoLocation,
    exportPhotos,
    batchUpdate,
    batchDelete,
  } = usePhotos();
  const {
    clients,
    loading: clientsLoading,
    error: clientsError,
    refresh: refreshClients,
    updateClient,
    deleteClient,
  } = useClients();
  const {
    projects,
    loading: projectsLoading,
    error: projectsError,
    refresh: refreshProjects,
    updateProject,
    deleteProject,
    enableShare,
    disableShare,
  } = useProjects({ onPhotosChanged: refresh });

  function refreshAll() {
    return Promise.all([
      refresh(),
      refreshProjects().catch(() => {}),
      refreshClients().catch(() => {}),
    ]);
  }

  const minDate = useMemo(() => {
    const dates = photos.map((p) => p.dateTaken?.slice(0, 10)).filter(Boolean);
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : '';
  }, [photos]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userTouchedFilter, setUserTouchedFilter] = useState(false);
  const [results, setResults] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(true);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [activeTag, setActiveTag] = useState(null);
  const [regionPolygon, setRegionPolygon] = useState(null);
  const [elevationOpen, setElevationOpen] = useState(false);
  const [hoveredPhotoId, setHoveredPhotoId] = useState(null);
  const [activeClientId, setActiveClientId] = useState(null);
  const [activeSurveyDate, setActiveSurveyDate] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(new Set());
  const [comparingPhotoId, setComparingPhotoId] = useState(null);
  const [comparisonPair, setComparisonPair] = useState(null);
  // FEAT: the GPS-less photo currently being placed on the map (null = not placing).
  const [placingPhoto, setPlacingPhoto] = useState(null);
  const mapRef = useRef(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const version = useAppVersion();
  // Below this width the sidebar is a drawer opened from the app bar's menu button.
  const narrow = useMediaQuery('(max-width: 599px)');
  const [resetConfirm, setResetConfirm] = React.useState(false);
  const shortcutsTrapRef = useFocusTrap(shortcutsOpen);

  // Timeline playback (state + effects live in the useTimeline hook)
  const timeline = useTimeline(photos);

  useEffect(() => {
    if (!loading && photos.length > 0) setUploadOpen(false);
  }, [loading, photos.length]);

  useEffect(() => {
    if (!userTouchedFilter) {
      setDateFrom(minDate || '');
      setDateTo(minDate ? TODAY : '');
    }
  }, [minDate, userTouchedFilter]);

  const minTs = minDate ? dateToMs(minDate) : 0;
  const maxTs = dateToMs(TODAY);
  const fromTs = dateFrom ? dateToMs(dateFrom) : minTs;
  const toTs = dateTo ? dateToMs(dateTo) : maxTs;
  const sliderRange = maxTs - minTs;
  const fromPct = sliderRange > 0 ? ((fromTs - minTs) / sliderRange) * 100 : 0;
  const toPct = sliderRange > 0 ? ((toTs - minTs) / sliderRange) * 100 : 100;

  const isFiltered = minDate
    ? dateFrom !== minDate || dateTo !== TODAY
    : Boolean(dateFrom || dateTo);

  // PERF-05: memoize the (formerly inline, per-render) filter chain.
  const filteredPhotos = useMemo(
    () =>
      filterPhotos(
        photos,
        {
          dateFrom,
          dateTo,
          mapBounds,
          activeTag,
          regionPolygon,
          activeSurveyDate,
          activeProjectId,
          activeClientId,
        },
        projects
      ),
    [
      photos,
      dateFrom,
      dateTo,
      mapBounds,
      activeTag,
      regionPolygon,
      activeSurveyDate,
      activeProjectId,
      activeClientId,
      projects,
    ]
  );

  // Fit map to relevant photos when hierarchy selection changes
  useEffect(() => {
    if (!activeClientId && !activeProjectId && !activeSurveyDate) return;
    const relevant = photos.filter((p) => {
      if (!p.hasGps || p.lat == null || p.lng == null) return false;
      if (activeProjectId && p.projectId !== activeProjectId) return false;
      if (activeSurveyDate === 'undated' && p.surveyDate != null) return false;
      if (activeSurveyDate && activeSurveyDate !== 'undated' && p.surveyDate !== activeSurveyDate)
        return false;
      if (activeClientId) {
        const proj = projects.find((pr) => pr.id === p.projectId);
        if (proj?.clientId !== activeClientId) return false;
      }
      return true;
    });
    if (relevant.length) mapRef.current?.fitToBounds(relevant);
  }, [activeClientId, activeProjectId, activeSurveyDate, photos, projects]);

  const { active: timelineActive, setPlaying: setTimelinePlaying } = timeline;
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '?') setShortcutsOpen((v) => !v);
      if (e.key === 'Escape' && shortcutsOpen) setShortcutsOpen(false);
      // FEAT: Escape cancels an in-progress map placement.
      if (e.key === 'Escape') setPlacingPhoto(null);
      if (e.key === ' ' && timelineActive) {
        e.preventDefault();
        setTimelinePlaying((p) => !p);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcutsOpen, timelineActive, setTimelinePlaying]);

  const displayPhotos = timeline.active ? timeline.slicePhotos : filteredPhotos;
  const displayGpsCount = displayPhotos.filter((p) => p.hasGps).length;

  function togglePhotoSelection(id) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearAllFilters() {
    setUserTouchedFilter(false);
    setActiveTag(null);
    setRegionPolygon(null);
    setActiveClientId(null);
    setActiveProjectId(null);
    setActiveSurveyDate(null);
  }

  function handleCompareClick(photoId) {
    if (!comparingPhotoId) {
      setComparingPhotoId(photoId);
    } else if (comparingPhotoId === photoId) {
      setComparingPhotoId(null);
    } else {
      setComparisonPair([comparingPhotoId, photoId]);
      setComparingPhotoId(null);
    }
  }

  // FEAT: manual GPS placement. Start places from the photo list; the map click
  // (or a drag of an existing manual pin) commits the coordinates.
  function startPlacingPhoto(photo) {
    setPlacingPhoto(photo);
    setMobileSidebarOpen(false);
  }

  async function handlePlacePhoto(lat, lng) {
    const target = placingPhoto;
    if (!target) return;
    setPlacingPhoto(null);
    try {
      await setPhotoLocation(target.id, lat, lng);
      toast(`Placed “${target.originalName}” on the map`, 'success');
    } catch (err) {
      toast(err.message || 'Could not place photo', 'error');
    }
  }

  async function handleRepositionPhoto(id, lat, lng) {
    try {
      await setPhotoLocation(id, lat, lng);
    } catch (err) {
      toast(err.message || 'Could not move pin', 'error');
      await refresh(); // snap the dragged pin back to its stored position
    }
  }

  async function handleClearPhotoLocation(photo) {
    try {
      await clearPhotoLocation(photo.id);
      toast(`Removed pin from “${photo.originalName}”`, 'success');
    } catch (err) {
      toast(err.message || 'Could not remove pin', 'error');
    }
  }

  return (
    <div className="app">
      <AppBar
        appName="PhotoMapper"
        version={version || 'dev'}
        icon={<MapPinned size={22} aria-hidden />}
        {...(narrow
          ? { onMenu: () => setMobileSidebarOpen((v) => !v), menuOpen: mobileSidebarOpen }
          : {})}
        onShortcuts={() => setShortcutsOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />
      <div className="app-body">
        {mobileSidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
        )}

        <aside className={`sidebar${mobileSidebarOpen ? ' mobile-open' : ''}`}>
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
                    onClick={() => setDrawerOpen((o) => !o)}
                    title="Upload log"
                    aria-label="Toggle upload log"
                  >
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor" />
                      <rect x="2" y="7" width="8" height="2" rx="1" fill="currentColor" />
                      <rect x="2" y="11" width="10" height="2" rx="1" fill="currentColor" />
                    </svg>
                    Log
                    {results.length > 0 && !drawerOpen && <span className="log-toggle-dot" />}
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
                    loading={clientsLoading || projectsLoading}
                    error={clientsError || projectsError}
                    onRetry={() => {
                      refreshClients();
                      refreshProjects();
                    }}
                    activeClientId={activeClientId}
                    activeProjectId={activeProjectId}
                    activeSurveyDate={activeSurveyDate}
                    onSelectClient={(id) => {
                      setActiveClientId(id);
                      setActiveProjectId(null);
                      setActiveSurveyDate(null);
                    }}
                    onSelectProject={(id) => {
                      setActiveProjectId(id);
                      setActiveSurveyDate(null);
                    }}
                    onSelectSurveyDate={setActiveSurveyDate}
                    onUpdateClient={updateClient}
                    onDeleteClient={deleteClient}
                    onUpdateProject={updateProject}
                    onDeleteProject={deleteProject}
                    onEnableShare={enableShare}
                    onDisableShare={disableShare}
                    toast={toast}
                  />
                </SidebarSection>
                <SidebarSection
                  title="Photos"
                  badge={
                    displayPhotos.length > 0 ? (
                      <span
                        title={
                          displayGpsCount === displayPhotos.length
                            ? `${displayPhotos.length} photos · all have GPS`
                            : `${displayPhotos.length} photos · ${displayGpsCount} mapped · ${displayPhotos.length - displayGpsCount} missing GPS`
                        }
                        style={
                          displayGpsCount < displayPhotos.length
                            ? { color: 'var(--color-warning)' }
                            : {}
                        }
                      >
                        {displayGpsCount < displayPhotos.length
                          ? `📍 ${displayGpsCount}/${displayPhotos.length}`
                          : `📍 ${displayPhotos.length}`}
                      </span>
                    ) : null
                  }
                >
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
                    onClearClient={() => {
                      setActiveClientId(null);
                      setActiveProjectId(null);
                      setActiveSurveyDate(null);
                    }}
                    onClearProject={() => {
                      setActiveProjectId(null);
                      setActiveSurveyDate(null);
                    }}
                    onClearSurvey={() => setActiveSurveyDate(null)}
                    onClearAll={clearAllFilters}
                  />

                  <PhotoList
                    photos={displayPhotos}
                    totalCount={photos.length}
                    loading={loading}
                    onDelete={deletePhoto}
                    onView={(photo) => {
                      setViewingPhoto(photo);
                      setMobileSidebarOpen(false);
                    }}
                    activeTag={activeTag}
                    onTagClick={(tag) => setActiveTag((prev) => (prev === tag ? null : tag))}
                    selectionMode={selectionMode}
                    selectedPhotoIds={selectedPhotoIds}
                    onToggleSelection={togglePhotoSelection}
                    onToggleSelectionMode={() => {
                      setSelectionMode((v) => !v);
                      setSelectedPhotoIds(new Set());
                    }}
                    onBatchUpdate={batchUpdate}
                    onBatchDelete={batchDelete}
                    comparingPhotoId={comparingPhotoId}
                    onCompareClick={handleCompareClick}
                    onPlacePhoto={startPlacingPhoto}
                    onClearLocation={handleClearPhotoLocation}
                    placingPhotoId={placingPhoto?.id ?? null}
                    toast={toast}
                    hasActiveFilters={
                      !!(
                        isFiltered ||
                        activeTag ||
                        regionPolygon ||
                        activeClientId ||
                        activeSurveyDate ||
                        activeProjectId
                      )
                    }
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
                              background: `linear-gradient(to right, #0f3460 ${fromPct}%, #e97b25 ${fromPct}%, #e97b25 ${toPct}%, #0f3460 ${toPct}%)`,
                            }}
                          >
                            <input
                              type="range"
                              className="date-range-input"
                              min={minTs}
                              max={maxTs}
                              value={fromTs}
                              style={{ zIndex: fromTs >= toTs ? 3 : 1 }}
                              aria-label="Filter start date"
                              aria-valuetext={dateFrom || minDate || 'earliest'}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (v <= toTs) {
                                  setDateFrom(msToDate(v));
                                  setUserTouchedFilter(true);
                                }
                              }}
                            />
                            <input
                              type="range"
                              className="date-range-input"
                              min={minTs}
                              max={maxTs}
                              value={toTs}
                              style={{ zIndex: toTs <= fromTs ? 3 : 1 }}
                              aria-label="Filter end date"
                              aria-valuetext={dateTo || TODAY || 'latest'}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (v >= fromTs) {
                                  setDateTo(msToDate(v));
                                  setUserTouchedFilter(true);
                                }
                              }}
                            />
                          </div>
                        </div>
                        {isFiltered && (
                          <button
                            className="date-filter-clear"
                            onClick={() => setUserTouchedFilter(false)}
                          >
                            Reset range
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {isFiltered && (
                          <button
                            className="date-filter-clear"
                            onClick={() => setUserTouchedFilter(false)}
                          >
                            Reset range
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <LocationSearch
                    onFlyTo={(lat, lng, zoom) => mapRef.current?.flyTo(lat, lng, zoom)}
                  />
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
                    onClick={() => setUploadOpen((o) => !o)}
                    title={uploadOpen ? 'Close upload' : 'Upload photos'}
                  >
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      {uploadOpen ? (
                        <path
                          d="M3 8h10"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      ) : (
                        <>
                          <path
                            d="M8 3v10M8 3L5 6M8 3l3 3"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M3 12h10"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </>
                      )}
                    </svg>
                    Upload Photos
                  </button>
                  <button
                    className={`footer-btn footer-btn--log${drawerOpen ? ' active' : ''}`}
                    onClick={() => setDrawerOpen((o) => !o)}
                    title="Upload log"
                    aria-label="Toggle upload log"
                  >
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor" />
                      <rect x="2" y="7" width="8" height="2" rx="1" fill="currentColor" />
                      <rect x="2" y="11" width="10" height="2" rx="1" fill="currentColor" />
                    </svg>
                    Log
                    {results.length > 0 && !drawerOpen && <span className="log-toggle-dot" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>

        <div className="map-panel">
          {placingPhoto && (
            <div className="placement-banner" role="status">
              <img
                className="placement-banner-thumb"
                src={`/uploads/${placingPhoto.thumbnailFilename ?? placingPhoto.filename}`}
                alt=""
              />
              <span className="placement-banner-text">
                Click the map to place <strong>{placingPhoto.originalName}</strong>
              </span>
              <button className="placement-banner-cancel" onClick={() => setPlacingPhoto(null)}>
                Cancel
              </button>
            </div>
          )}
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
            hasGps={photos.some((p) => p.hasGps)}
            placingPhoto={placingPhoto}
            onPlacePhoto={handlePlacePhoto}
            onRepositionPhoto={handleRepositionPhoto}
          />
          {elevationOpen && (
            <ElevationProfile
              photos={displayPhotos}
              hoveredPhotoId={hoveredPhotoId}
              onHover={setHoveredPhotoId}
            />
          )}
          {displayPhotos.filter((p) => p.hasGps && p.altitude != null).length >= 2 && (
            <button
              className={`elevation-toggle-btn${elevationOpen ? ' active' : ''}`}
              onClick={() => setElevationOpen((o) => !o)}
            >
              {elevationOpen ? '▾ Hide Elevation' : '▴ Elevation Profile'}
            </button>
          )}
        </div>
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
          onChangeLeft={(id) => setComparisonPair(([, r]) => [id, r])}
          onChangeRight={(id) => setComparisonPair(([l]) => [l, id])}
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRestored={async () => {
          await refreshAll();
          toast('Backup restored', 'success');
        }}
      />

      {shortcutsOpen && (
        <div className="shortcuts-overlay" onClick={() => setShortcutsOpen(false)}>
          <div
            className="shortcuts-box"
            ref={shortcutsTrapRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-header">
              <span>Keyboard Shortcuts</span>
              <button
                className="shortcuts-close"
                onClick={() => setShortcutsOpen(false)}
                aria-label="Close shortcuts"
              >
                ✕
              </button>
            </div>
            <dl className="shortcuts-list">
              <dt>?</dt>
              <dd>Show / hide this overlay</dd>
              <dt>Esc</dt>
              <dd>Close modal or overlay</dd>
              <dt>← →</dt>
              <dd>Previous / next photo in lightbox</dd>
              <dt>↑ ↓</dt>
              <dd>Navigate photo list</dd>
              <dt>Enter</dt>
              <dd>Open focused photo</dd>
              <dt>Space</dt>
              <dd>Play / pause timeline</dd>
            </dl>
            <p className="shortcuts-hint">Press ? or Esc to close</p>
            <div className="shortcuts-reset">
              {resetConfirm ? (
                <>
                  <span className="shortcuts-reset-warning">
                    This will delete all photos, clients and projects.
                  </span>
                  <div className="shortcuts-reset-actions">
                    <button
                      className="shortcuts-reset-confirm"
                      onClick={async () => {
                        try {
                          await apiFetch('/api/reset', { method: 'DELETE' });
                          setResetConfirm(false);
                          setShortcutsOpen(false);
                          await refreshAll();
                          toast('All data cleared', 'success');
                        } catch (err) {
                          toast(err.message || 'Reset failed', 'error');
                        }
                      }}
                    >
                      Yes, wipe everything
                    </button>
                    <button
                      className="shortcuts-reset-cancel"
                      onClick={() => setResetConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button className="shortcuts-reset-btn" onClick={() => setResetConfirm(true)}>
                  Reset all data…
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
