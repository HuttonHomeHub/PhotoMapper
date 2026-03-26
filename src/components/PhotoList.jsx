import { useState } from 'react'

export function PhotoList({ photos, onDelete }) {
  const [deletingId, setDeletingId] = useState(null)

  if (!photos.length) return null

  async function handleDelete(photo) {
    if (!window.confirm(`Delete "${photo.originalName}"? This cannot be undone.`)) return
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
    <div className="photo-list">
      {photos.map(photo => (
        <div key={photo.id} className="photo-list-item">
          <img
            src={`/uploads/${photo.filename}`}
            alt=""
            className="photo-list-thumb"
            loading="lazy"
          />
          <div className="photo-list-info">
            <div className="photo-list-name">{photo.originalName}</div>
            <div className="photo-list-meta">{photo.hasGps ? 'On map' : 'No GPS'}</div>
          </div>
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
  )
}
