import { useEffect } from 'react'

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

export function PhotoLightbox({ photo, photos, onClose }) {
  const idx = photos.findIndex(p => p.id === photo.id)

  function prev() {
    const i = (idx - 1 + photos.length) % photos.length
    onClose(photos[i])
  }

  function next() {
    const i = (idx + 1) % photos.length
    onClose(photos[i])
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose(null)
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

      <div className="lightbox-box" onClick={e => e.stopPropagation()}>
        <button className="lightbox-close" onClick={() => onClose(null)} aria-label="Close">&#10005;</button>
        <img
          className="lightbox-img"
          src={`/uploads/${photo.filename}`}
          alt={photo.originalName}
        />
        <div className="lightbox-meta">
          <div className="lightbox-title">{photo.originalName}</div>
          <MetaRow label="Taken" value={formatDate(photo.dateTaken)} />
          <MetaRow label="Camera" value={[photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ') || null} />
          <MetaRow label="Focal len." value={photo.focalLength != null ? `${photo.focalLength}mm` : null} />
          <MetaRow label="Aperture" value={photo.fNumber != null ? `f/${photo.fNumber}` : null} />
          <MetaRow label="ISO" value={photo.iso} />
          <MetaRow label="Exposure" value={photo.exposureTime} />
          <MetaRow label="Altitude" value={photo.altitude != null ? `${Math.round(photo.altitude)}m` : null} />
          <MetaRow label="Direction" value={photo.imgDirection != null ? `${Math.round(photo.imgDirection)}°` : null} />
          <MetaRow label="GPS" value={photo.hasGps ? `${photo.lat?.toFixed(5)}, ${photo.lng?.toFixed(5)}` : 'No GPS'} />
        </div>
      </div>

      {photos.length > 1 && (
        <button className="lightbox-nav lightbox-nav-next" onClick={e => { e.stopPropagation(); next() }} aria-label="Next photo">&#8250;</button>
      )}
    </div>
  )
}
