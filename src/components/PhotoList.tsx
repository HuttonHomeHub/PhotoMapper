import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import type { Photo } from '../../shared/api.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import type { ShowToast } from './Toast.tsx';

type SortBy = 'default' | 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc' | 'gps-first';

export interface PhotoListProps {
  photos: Photo[];
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
  onView: (photo: Photo) => void;
  activeTag: string | null;
  onTagClick?: (tag: string) => void;
  selectionMode: boolean;
  selectedPhotoIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectionMode: () => void;
  onBatchUpdate: (
    ids: string[],
    changes: { tags?: string[]; description?: string | null; mergeTags?: boolean }
  ) => Promise<void>;
  comparingPhotoId: string | null;
  onCompareClick: (id: string) => void;
  onPlacePhoto?: (photo: Photo) => void;
  onClearLocation?: (photo: Photo) => void;
  placingPhotoId: string | null;
  toast?: ShowToast;
  hasActiveFilters: boolean;
  onClearAllFilters: () => void;
  timelinePhotoId: string | null;
}

function SkeletonRow() {
  return (
    <div className="photo-list-item skeleton-item" aria-hidden="true">
      <div className="skeleton skeleton-thumb" />
      <div className="photo-list-info">
        <div className="skeleton skeleton-line skeleton-line-long" />
        <div className="skeleton skeleton-line skeleton-line-short" />
      </div>
    </div>
  );
}

export function PhotoList({
  photos,
  loading,
  onDelete,
  onView,
  activeTag,
  onTagClick,
  selectionMode,
  selectedPhotoIds,
  onToggleSelection,
  onToggleSelectionMode,
  onBatchUpdate,
  comparingPhotoId,
  onCompareClick,
  onPlacePhoto,
  onClearLocation,
  placingPhotoId,
  toast,
  hasActiveFilters,
  onClearAllFilters,
  timelinePhotoId,
}: PhotoListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Photo | null>(null);
  const [tagPromptOpen, setTagPromptOpen] = useState(false);
  const [batchTagValue, setBatchTagValue] = useState('');
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll timeline-active photo into view
  useEffect(() => {
    if (!timelinePhotoId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-photo-id="${timelinePhotoId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [timelinePhotoId]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="photo-list" aria-label="Loading photos…">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  // Empty states
  if (!photos.length) {
    if (hasActiveFilters) {
      return (
        <div className="photo-list-empty">
          <div className="photo-list-empty-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4.5 4.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="photo-list-empty-title">No photos match your filters</p>
          <p className="photo-list-empty-sub">Try adjusting or clearing your filters.</p>
          <button
            className="date-filter-clear"
            style={{ marginTop: 12 }}
            onClick={onClearAllFilters}
          >
            Clear all filters
          </button>
        </div>
      );
    }
    return (
      <div className="photo-list-empty">
        <div className="photo-list-empty-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        </div>
        <p className="photo-list-empty-title">No photos yet</p>
        <p className="photo-list-empty-sub">
          Drop JPEGs above — those with GPS data will appear on the map automatically.
        </p>
      </div>
    );
  }

  // Search + sort
  let displayed = photos;
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    displayed = displayed.filter(
      (p) =>
        p.originalName?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q)) ||
        p.locationName?.toLowerCase().includes(q)
    );
  }
  if (sortBy === 'name-asc') {
    displayed = [...displayed].sort((a, b) =>
      (a.originalName ?? '').localeCompare(b.originalName ?? '')
    );
  } else if (sortBy === 'name-desc') {
    displayed = [...displayed].sort((a, b) =>
      (b.originalName ?? '').localeCompare(a.originalName ?? '')
    );
  } else if (sortBy === 'date-asc') {
    displayed = [...displayed].sort((a, b) =>
      (a.dateTaken ?? a.uploadedAt ?? '').localeCompare(b.dateTaken ?? b.uploadedAt ?? '')
    );
  } else if (sortBy === 'date-desc') {
    displayed = [...displayed].sort((a, b) =>
      (b.dateTaken ?? b.uploadedAt ?? '').localeCompare(a.dateTaken ?? a.uploadedAt ?? '')
    );
  } else if (sortBy === 'gps-first') {
    displayed = [...displayed].sort((a, b) => (b.hasGps ? 1 : 0) - (a.hasGps ? 1 : 0));
  }

  function handleDelete(photo: Photo) {
    setPendingDelete(photo);
  }

  async function confirmDelete() {
    const photo = pendingDelete;
    if (!photo) return;
    setPendingDelete(null);
    setDeletingId(photo.id);
    try {
      await onDelete(photo.id);
      toast?.('Photo deleted', 'success');
    } catch (err) {
      toast?.(`Could not delete: ${(err as Error).message}`, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBatchDelete() {
    const ids = [...selectedPhotoIds];
    setBatchConfirmOpen(false);
    setBatchProgress({ done: 0, total: ids.length });
    const failures: string[] = [];
    for (const [i, id] of ids.entries()) {
      try {
        await onDelete(id);
      } catch {
        failures.push(id);
      }
      setBatchProgress({ done: i + 1, total: ids.length });
    }
    setBatchProgress(null);
    if (failures.length === 0) {
      toast?.(`${ids.length} photo${ids.length !== 1 ? 's' : ''} deleted`, 'success');
    } else {
      toast?.(`${ids.length - failures.length} deleted, ${failures.length} failed`, 'error');
    }
  }

  function handleKeyDown(e: KeyboardEvent, photo: Photo, idx: number) {
    if (e.key === 'Enter') {
      onView(photo);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const items = listRef.current?.querySelectorAll<HTMLElement>('[data-photo-item]');
      items?.[idx + 1]?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const items = listRef.current?.querySelectorAll<HTMLElement>('[data-photo-item]');
      items?.[idx - 1]?.focus();
    }
  }

  return (
    <>
      <div className="photo-list-search-row">
        <input
          className="photo-list-search-input"
          type="search"
          placeholder="Search photos…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search photos by name, tag, or location"
        />
        <select
          className="photo-list-sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Sort photos"
        >
          <option value="default">Default order</option>
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="gps-first">GPS first</option>
        </select>
        <button
          className={`select-mode-btn${selectionMode ? ' active' : ''}`}
          onClick={onToggleSelectionMode}
          title={selectionMode ? 'Exit selection mode' : 'Multi-select photos'}
          aria-pressed={selectionMode}
        >
          {selectionMode ? 'Cancel' : 'Select'}
        </button>
        {comparingPhotoId && <div className="comparing-hint">Pick a second photo to compare</div>}
      </div>

      {selectedPhotoIds.size > 0 && (
        <div className="selection-toolbar">
          <span className="selection-count">{selectedPhotoIds.size} selected</span>
          {batchProgress ? (
            <span className="batch-progress">
              Deleting {batchProgress.done}/{batchProgress.total}…
            </span>
          ) : (
            <>
              {tagPromptOpen ? (
                <span className="batch-tag-inline">
                  <input
                    className="batch-tag-input"
                    autoFocus
                    placeholder="Tag name"
                    value={batchTagValue}
                    onChange={(e) => setBatchTagValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && batchTagValue.trim()) {
                        onBatchUpdate([...selectedPhotoIds], {
                          tags: [batchTagValue.trim()],
                          mergeTags: true,
                        });
                        toast?.(
                          `Tag "${batchTagValue.trim()}" added to ${selectedPhotoIds.size} photo${selectedPhotoIds.size !== 1 ? 's' : ''}`,
                          'success'
                        );
                        setBatchTagValue('');
                        setTagPromptOpen(false);
                      }
                      if (e.key === 'Escape') {
                        setBatchTagValue('');
                        setTagPromptOpen(false);
                      }
                    }}
                  />
                  <button
                    className="sel-action-btn"
                    onClick={() => {
                      setBatchTagValue('');
                      setTagPromptOpen(false);
                    }}
                    aria-label="Cancel tag"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <button className="sel-action-btn" onClick={() => setTagPromptOpen(true)}>
                  + Tag
                </button>
              )}
              <button
                className="sel-action-btn sel-delete-btn"
                onClick={() => setBatchConfirmOpen(true)}
                aria-label={`Delete ${selectedPhotoIds.size} selected photos`}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {searchQuery && displayed.length === 0 && (
        <div className="photo-list-empty" style={{ padding: '16px' }}>
          <p className="photo-list-empty-title" style={{ fontSize: 13 }}>
            No results for &quot;{searchQuery}&quot;
          </p>
        </div>
      )}

      <div className="photo-list" ref={listRef}>
        {displayed.map((photo, idx) => (
          <div
            key={photo.id}
            className={`photo-list-item${selectedPhotoIds?.has(photo.id) ? ' selected' : ''}${timelinePhotoId === photo.id ? ' timeline-active' : ''}`}
            data-photo-item
            data-photo-id={photo.id}
            tabIndex={selectionMode ? -1 : 0}
            role="button"
            aria-label={`${photo.originalName}${photo.hasGps ? ', on map' : ', no GPS'}`}
            onClick={() => (selectionMode ? onToggleSelection(photo.id) : undefined)}
            onKeyDown={(e) => !selectionMode && handleKeyDown(e, photo, idx)}
          >
            <button
              className="photo-list-thumb-btn"
              onClick={() => (selectionMode ? onToggleSelection(photo.id) : onView(photo))}
              aria-label={`View ${photo.originalName}`}
              tabIndex={-1}
              style={{ position: 'relative' }}
            >
              <img
                src={`/uploads/${photo.thumbnailFilename ?? photo.filename}`}
                alt={photo.description || photo.originalName}
                className="photo-list-thumb"
                loading="lazy"
              />
              {selectionMode && (
                <input
                  type="checkbox"
                  className="photo-select-checkbox"
                  checked={selectedPhotoIds?.has(photo.id) ?? false}
                  onChange={() => onToggleSelection(photo.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${photo.originalName}`}
                />
              )}
            </button>
            <div className="photo-list-info">
              <div className="photo-list-name">{photo.originalName}</div>
              <div className="photo-list-meta">
                {photo.locationName
                  ? photo.locationName
                  : photo.hasGps
                    ? photo.manualGps
                      ? 'Placed manually'
                      : 'On map'
                    : 'No GPS'}
              </div>
              {!photo.hasGps && onPlacePhoto && (
                <button
                  className={`photo-list-place-btn${placingPhotoId === photo.id ? ' active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlacePhoto(photo);
                  }}
                  tabIndex={-1}
                  title="Click, then click the map to position this photo"
                >
                  📍 {placingPhotoId === photo.id ? 'Click the map…' : 'Place on map'}
                </button>
              )}
              {photo.manualGps && onClearLocation && (
                <button
                  className="photo-list-place-btn photo-list-place-btn--clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearLocation(photo);
                  }}
                  tabIndex={-1}
                  title="Remove the hand-placed pin (returns to No GPS)"
                >
                  ✕ Remove pin
                </button>
              )}
              {photo.tags?.length > 0 && (
                <div className="photo-list-tags">
                  {photo.tags.slice(0, 3).map((tag) => (
                    <button
                      key={tag}
                      className={`tag-chip-sm${activeTag === tag ? ' active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTagClick?.(tag);
                      }}
                      aria-pressed={activeTag === tag}
                      aria-label={`Filter by tag: ${tag}`}
                    >
                      {tag}
                    </button>
                  ))}
                  {photo.tags.length > 3 && (
                    <span className="tag-overflow">+{photo.tags.length - 3}</span>
                  )}
                </div>
              )}
              {photo.surveyDate && (
                <div className="photo-list-survey-date">
                  {photo.surveyDate.split('-').reverse().join('/')}
                </div>
              )}
            </div>
            <button
              className={`photo-compare-btn${comparingPhotoId === photo.id ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onCompareClick(photo.id);
              }}
              title={
                comparingPhotoId && comparingPhotoId !== photo.id
                  ? 'Compare with this photo'
                  : 'Start comparison'
              }
              aria-label={`Compare ${photo.originalName}`}
              tabIndex={-1}
            >
              ⧉
            </button>
            <button
              className="photo-list-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(photo);
              }}
              disabled={deletingId === photo.id}
              aria-label={`Delete ${photo.originalName}`}
              tabIndex={-1}
            >
              {deletingId === photo.id ? '…' : '✕'}
            </button>
          </div>
        ))}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Delete photo?"
          message={
            <>
              <span className="confirm-modal-filename">{pendingDelete.originalName}</span>
              <br />
              This cannot be undone.
            </>
          }
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {batchConfirmOpen && (
        <ConfirmModal
          title={`Delete ${selectedPhotoIds.size} photo${selectedPhotoIds.size !== 1 ? 's' : ''}?`}
          message="This cannot be undone."
          confirmLabel={`Delete ${selectedPhotoIds.size}`}
          onConfirm={handleBatchDelete}
          onCancel={() => setBatchConfirmOpen(false)}
        />
      )}
    </>
  );
}
