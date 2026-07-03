import { useState } from 'react'
import { formatDate } from '../lib/format.js'

// SEC-12: the map marker popup as a React component (previously an innerHTML
// string built by hand). React escapes all values, so there's no way to
// reintroduce a stored-XSS hole by adding an un-escaped field later.
export function PhotoPopup({ photo, onView, onDelete, onClose }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  const rows = []
  if (photo.dateTaken) rows.push(['Taken', formatDate(photo.dateTaken)])
  if (photo.cameraMake || photo.cameraModel) {
    rows.push(['Camera', [photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ')])
  }
  if (photo.focalLength != null) rows.push(['Focal len.', `${photo.focalLength}mm`])
  if (photo.fNumber != null) rows.push(['Aperture', `f/${photo.fNumber}`])
  if (photo.iso != null) rows.push(['ISO', photo.iso])
  if (photo.exposureTime) rows.push(['Exposure', photo.exposureTime])
  if (photo.altitude != null) rows.push(['Altitude', `${Math.round(photo.altitude)}m`])
  if (photo.imgDirection != null) rows.push(['Direction', `${Math.round(photo.imgDirection)}°`])

  async function handleDelete() {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    try {
      await onDelete(photo.id)
      onClose?.()
    } catch (err) {
      setDeleting(false)
      setError(err.message)
    }
  }

  const hasCoords = photo.hasGps && photo.lat != null && photo.lng != null

  return (
    <div className="popup-content">
      <div className="popup-title">{photo.originalName}</div>
      {rows.map(([label, value]) => (
        <div className="popup-row" key={label}>
          <span className="popup-label">{label}</span>
          <span className="popup-value">{value}</span>
        </div>
      ))}
      <div className="popup-actions">
        <button className="popup-view-btn" onClick={() => onView?.(photo)}>
          View photo
        </button>
        <button className="popup-delete-btn" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete photo'}
        </button>
      </div>
      {error && <div className="popup-error">Could not delete: {error}</div>}
      {hasCoords && (
        <a
          href={`https://www.google.com/maps?q=${photo.lat},${photo.lng}`}
          target="_blank"
          rel="noreferrer"
          className="popup-maps-link"
        >
          Open in Google Maps ↗
        </a>
      )}
    </div>
  )
}
