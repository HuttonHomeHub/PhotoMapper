import { useState } from 'react'

export function PhotoList({ photos, onDelete, onView }) {
  const [deletingId, setDeletingId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  if (!photos.length) return null

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
      <div className="photo-list">
        {photos.map(photo => (
          <div key={photo.id} className="photo-list-item">
            <button className="photo-list-thumb-btn" onClick={() => onView(photo)} aria-label={`View ${photo.originalName}`}>
              <img
                src={`/uploads/${photo.thumbnailFilename ?? photo.filename}`}
                alt=""
                className="photo-list-thumb"
                loading="lazy"
              />
            </button>
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
      {pendingDelete && (
        <div className="confirm-modal-overlay" onClick={() => setPendingDelete(null)}>
          <div className="confirm-modal-box" onClick={e => e.stopPropagation()}>
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
