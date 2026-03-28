import { useEffect, useState } from 'react'

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
  const [copied, setCopied] = useState(false)

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

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose(null)
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photo, photos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset copied state when photo changes
  useEffect(() => {
    setCopied(false)
  }, [photo?.id])

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
