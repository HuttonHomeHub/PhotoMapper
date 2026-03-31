import { useState } from 'react'
import React from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap.js'

export function PhotoList({
  photos, onDelete, onView, activeTag, onTagClick,
  selectionMode, selectedPhotoIds, onToggleSelection,
  onToggleSelectionMode, onBatchUpdate, onBatchDelete, onBatchAddToCollection,
  collections, activeCollectionId,
  comparingPhotoId, onCompareClick
}) {
  const [deletingId, setDeletingId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const confirmTrapRef = useFocusTrap(!!pendingDelete)
  const [tagPromptOpen, setTagPromptOpen] = React.useState(false)
  const [batchTagValue, setBatchTagValue] = React.useState('')

  if (!photos.length) {
    return (
      <div className="photo-list-empty">
        <div className="photo-list-empty-icon">🗺️</div>
        <p className="photo-list-empty-title">No photos yet</p>
        <p className="photo-list-empty-sub">
          Drop JPEGs above — those with GPS data will appear on the map automatically.
        </p>
      </div>
    )
  }

  async function handleDelete(photo) {
    setPendingDelete(photo)
  }

  async function confirmDelete() {
    const photo = pendingDelete
    setPendingDelete(null)
    setDeletingId(photo.id)
    try {
      await onDelete(photo.id)
    } catch (err) {
      alert(`Could not delete: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="photo-list-header-row">
        <button
          className={`select-mode-btn${selectionMode ? ' active' : ''}`}
          onClick={onToggleSelectionMode}
          title="Multi-select photos"
        >
          {selectionMode ? 'Cancel' : 'Select'}
        </button>
        {comparingPhotoId && (
          <div className="comparing-hint">
            Pick a second photo to compare
          </div>
        )}
      </div>

      {selectedPhotoIds?.size > 0 && (
        <div className="selection-toolbar">
          <span className="selection-count">{selectedPhotoIds.size} selected</span>
          {tagPromptOpen ? (
            <span className="batch-tag-inline">
              <input
                className="batch-tag-input"
                autoFocus
                placeholder="Tag name"
                value={batchTagValue}
                onChange={e => setBatchTagValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && batchTagValue.trim()) {
                    onBatchUpdate([...selectedPhotoIds], { tags: [batchTagValue.trim()], mergeTags: true })
                    setBatchTagValue('')
                    setTagPromptOpen(false)
                  }
                  if (e.key === 'Escape') {
                    setBatchTagValue('')
                    setTagPromptOpen(false)
                  }
                }}
              />
              <button
                className="sel-action-btn"
                onClick={() => { setBatchTagValue(''); setTagPromptOpen(false) }}
              >✕</button>
            </span>
          ) : (
            <button className="sel-action-btn" onClick={() => setTagPromptOpen(true)}>+ Tag</button>
          )}
          <select
            className="sel-collection-select"
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                onBatchAddToCollection(e.target.value, [...selectedPhotoIds])
                e.target.value = ''
              }
            }}
          >
            <option value="">Add to collection…</option>
            {collections?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="sel-action-btn sel-delete-btn" onClick={() => {
            if (window.confirm(`Delete ${selectedPhotoIds.size} photos?`)) {
              onBatchDelete([...selectedPhotoIds])
            }
          }}>Delete</button>
        </div>
      )}

      <div className="photo-list">
        {photos.map(photo => (
          <div
            key={photo.id}
            className={`photo-list-item${selectedPhotoIds?.has(photo.id) ? ' selected' : ''}`}
            onClick={() => selectionMode ? onToggleSelection(photo.id) : undefined}
          >
            <button
              className="photo-list-thumb-btn"
              onClick={() => selectionMode ? onToggleSelection(photo.id) : onView(photo)}
              aria-label={`View ${photo.originalName}`}
              style={{ position: 'relative' }}
            >
              <img
                src={`/uploads/${photo.thumbnailFilename ?? photo.filename}`}
                alt=""
                className="photo-list-thumb"
                loading="lazy"
              />
              {selectionMode && (
                <input
                  type="checkbox"
                  className="photo-select-checkbox"
                  checked={selectedPhotoIds?.has(photo.id) ?? false}
                  onChange={() => onToggleSelection(photo.id)}
                  onClick={e => e.stopPropagation()}
                />
              )}
            </button>
            <div className="photo-list-info">
              <div className="photo-list-name">{photo.originalName}</div>
              <div className="photo-list-meta">
                {photo.locationName
                  ? photo.locationName
                  : (photo.hasGps ? 'On map' : 'No GPS')}
              </div>
              {photo.tags?.length > 0 && (
                <div className="photo-list-tags">
                  {photo.tags.slice(0, 3).map(tag => (
                    <button
                      key={tag}
                      className={`tag-chip-sm${activeTag === tag ? ' active' : ''}`}
                      onClick={e => { e.stopPropagation(); onTagClick?.(tag) }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
              {photo.collectionIds?.length > 0 && (
                <div className="photo-collection-dots">
                  {photo.collectionIds.slice(0, 3).map(cid => {
                    const col = collections?.find(c => c.id === cid)
                    return col ? (
                      <span
                        key={cid}
                        className="photo-collection-dot"
                        style={{ background: col.color }}
                        title={col.name}
                      />
                    ) : null
                  })}
                </div>
              )}
            </div>
            <button
              className={`photo-compare-btn${comparingPhotoId === photo.id ? ' active' : ''}`}
              onClick={e => { e.stopPropagation(); onCompareClick(photo.id) }}
              title={comparingPhotoId && comparingPhotoId !== photo.id ? 'Compare with this photo' : 'Start comparison'}
            >
              ⧉
            </button>
            <button
              className="photo-list-delete"
              onClick={() => handleDelete(photo)}
              disabled={deletingId === photo.id}
              aria-label={`Delete ${photo.originalName}`}
            >
              {deletingId === photo.id ? '\u2026' : '\u2715'}
            </button>
          </div>
        ))}
      </div>
      {pendingDelete && (
        <div className="confirm-modal-overlay" onClick={() => setPendingDelete(null)}>
          <div className="confirm-modal-box" ref={confirmTrapRef} onClick={e => e.stopPropagation()}>
            <p className="confirm-modal-title">Delete photo?</p>
            <p className="confirm-modal-message">
              <span className="confirm-modal-filename">{pendingDelete.originalName}</span>
              <br />This cannot be undone.
            </p>
            <div className="confirm-modal-actions">
              <button className="confirm-modal-cancel" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button className="confirm-modal-delete" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
