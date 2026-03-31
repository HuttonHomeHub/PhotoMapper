import { useEffect, useState, useRef, useCallback } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap.js'

function formatDate(iso) {
  if (!iso) return null
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function MetaRow({ label, value }) {
  if (value == null) return null
  return (
    <div className="lightbox-row">
      <span className="lightbox-label">{label}</span>
      <span className="lightbox-value">{value}</span>
    </div>
  )
}

export function PhotoLightbox({ photo, photos, onClose, onUpdate }) {
  const idx = photos.findIndex(p => p.id === photo.id)
  const [copied, setCopied] = useState(false)
  const [description, setDescription] = useState(photo.description ?? '')
  const [tags, setTags] = useState(photo.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const trapRef = useFocusTrap(true)
  const saveTimerRef = useRef(null)
  const [savedState, setSavedState] = useState(null)
  const savedTimerRef = useRef(null)

  function prev() {
    const i = (idx - 1 + photos.length) % photos.length
    onClose(photos[i])
  }

  function next() {
    const i = (idx + 1) % photos.length
    onClose(photos[i])
  }

  function copyCoords() {
    navigator.clipboard.writeText(`${photo.lat?.toFixed(5)}, ${photo.lng?.toFixed(5)}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Sync local state when photo changes
  useEffect(() => {
    setDescription(photo.description ?? '')
    setTags(photo.tags ?? [])
    setTagInput('')
    setCopied(false)
  }, [photo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = useCallback((newDesc, newTags) => {
    clearTimeout(saveTimerRef.current)
    setSavedState('saving')
    saveTimerRef.current = setTimeout(() => {
      onUpdate?.(photo.id, { description: newDesc, tags: newTags })
      setSavedState('saved')
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSavedState(null), 2000)
    }, 600)
  }, [photo.id, onUpdate])

  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current)
      clearTimeout(savedTimerRef.current)
    }
  }, [])

  function handleDescriptionChange(e) {
    const val = e.target.value
    setDescription(val)
    scheduleSave(val, tags)
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    }
  }

  function addTag() {
    const trimmed = tagInput.trim().replace(/,+$/, '')
    if (!trimmed || tags.includes(trimmed)) {
      setTagInput('')
      return
    }
    const newTags = [...tags, trimmed]
    setTags(newTags)
    setTagInput('')
    scheduleSave(description, newTags)
  }

  function removeTag(tag) {
    const newTags = tags.filter(t => t !== tag)
    setTags(newTags)
    scheduleSave(description, newTags)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose(null)
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photo, photos]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!photo) return null

  return (
    <div className="lightbox-overlay" onClick={() => onClose(null)}>
      {photos.length > 1 && (
        <button className="lightbox-nav lightbox-nav-prev" onClick={e => { e.stopPropagation(); prev() }} aria-label="Previous photo">&#8249;</button>
      )}

      <div className="lightbox-box" ref={trapRef} onClick={e => e.stopPropagation()}>
        <button className="lightbox-close" onClick={() => onClose(null)} aria-label="Close">&#10005;</button>
        <img
          className="lightbox-img"
          src={`/uploads/${photo.filename}`}
          alt={photo.originalName}
        />
        <div className="lightbox-meta">
          <div className="lightbox-title">{photo.originalName}</div>
          {photo.locationName && (
            <div className="lightbox-location">{photo.locationName}</div>
          )}
          <MetaRow label="Taken" value={formatDate(photo.dateTaken)} />
          <MetaRow label="Camera" value={[photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ') || null} />
          <MetaRow label="Focal len." value={photo.focalLength != null ? `${photo.focalLength}mm` : null} />
          <MetaRow label="Aperture" value={photo.fNumber != null ? `f/${photo.fNumber}` : null} />
          <MetaRow label="ISO" value={photo.iso} />
          <MetaRow label="Exposure" value={photo.exposureTime} />
          <MetaRow label="Altitude" value={photo.altitude != null ? `${Math.round(photo.altitude)}m` : null} />
          <MetaRow label="Direction" value={photo.imgDirection != null ? `${Math.round(photo.imgDirection)}°` : null} />
          <MetaRow label="GPS" value={photo.hasGps ? `${photo.lat?.toFixed(5)}, ${photo.lng?.toFixed(5)}` : 'No GPS'} />
          {photo.hasGps && photo.lat != null && photo.lng != null && (
            <div className="lightbox-gps-actions">
              <button className="lightbox-gps-btn" onClick={copyCoords}>
                {copied ? '✓ Copied!' : '⎘ Copy coords'}
              </button>
              <a
                href={`https://www.google.com/maps?q=${photo.lat},${photo.lng}`}
                target="_blank"
                rel="noreferrer"
                className="lightbox-gps-btn"
              >
                Maps ↗
              </a>
            </div>
          )}

          <div className="lightbox-field-notes">
            <div className="lightbox-field-label">
              Field Notes
              {savedState === 'saving' && <span className="save-indicator saving">saving…</span>}
              {savedState === 'saved'  && <span className="save-indicator saved">✓ Saved</span>}
            </div>
            <textarea
              className="lightbox-notes-input"
              placeholder="Add observation notes…"
              value={description}
              onChange={handleDescriptionChange}
              rows={3}
            />
            <div className="lightbox-tags-row">
              {tags.map(tag => (
                <span key={tag} className="tag-chip">
                  {tag}
                  <button className="tag-chip-remove" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>×</button>
                </span>
              ))}
              <input
                className="tag-input"
                placeholder="Add tag, press Enter"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
              />
            </div>
          </div>
        </div>
        <div className="lightbox-footer">
          <a
            href={`/uploads/${photo.filename}`}
            download={photo.originalName}
            className="lightbox-download-btn"
          >
            ↓ Download
          </a>
        </div>
      </div>

      {photos.length > 1 && (
        <button className="lightbox-nav lightbox-nav-next" onClick={e => { e.stopPropagation(); next() }} aria-label="Next photo">&#8250;</button>
      )}
    </div>
  )
}
