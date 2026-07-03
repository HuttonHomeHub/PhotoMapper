import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../lib/format.js';

function MetaRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="comparison-meta-row">
      <span className="comparison-meta-label">{label}</span>
      <span className="comparison-meta-value">{value}</span>
    </div>
  );
}

function ComparisonPanel({
  photo,
  photos,
  onChangePrev,
  onChangeNext,
  focused,
  onFocus,
  downloadFilename,
}) {
  if (!photo) {
    return (
      <div className="comparison-panel" onClick={onFocus}>
        <div className="comparison-panel-header">
          <span className="comparison-panel-name">No photo selected</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`comparison-panel${focused ? ' focused' : ''}`} onClick={onFocus}>
      <div className="comparison-panel-header">
        <button
          className="comparison-panel-nav"
          onClick={(e) => {
            e.stopPropagation();
            onChangePrev();
          }}
          aria-label="Previous photo"
        >
          &#8249;
        </button>
        <span className="comparison-panel-name">{photo.originalName}</span>
        <button
          className="comparison-panel-nav"
          onClick={(e) => {
            e.stopPropagation();
            onChangeNext();
          }}
          aria-label="Next photo"
        >
          &#8250;
        </button>
      </div>
      <div className="comparison-panel-img-wrap">
        <img
          className="comparison-panel-img"
          src={`/uploads/${photo.filename}`}
          alt={photo.originalName}
        />
      </div>
      <div className="comparison-panel-meta">
        <MetaRow label="Taken" value={formatDate(photo.dateTaken)} />
        <MetaRow
          label="Camera"
          value={[photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ') || null}
        />
        <MetaRow
          label="Focal len."
          value={photo.focalLength != null ? `${photo.focalLength}mm` : null}
        />
        <MetaRow label="Aperture" value={photo.fNumber != null ? `f/${photo.fNumber}` : null} />
        <MetaRow label="ISO" value={photo.iso} />
        <MetaRow label="Exposure" value={photo.exposureTime} />
        <MetaRow
          label="Altitude"
          value={photo.altitude != null ? `${Math.round(photo.altitude)}m` : null}
        />
        <MetaRow
          label="Direction"
          value={photo.imgDirection != null ? `${Math.round(photo.imgDirection)}°` : null}
        />
        <MetaRow
          label="GPS"
          value={photo.hasGps ? `${photo.lat?.toFixed(5)}, ${photo.lng?.toFixed(5)}` : 'No GPS'}
        />
        <div className="comparison-panel-download-wrap">
          <a
            className="comparison-panel-download"
            href={`/uploads/${photo.filename}`}
            download={photo.originalName}
            onClick={(e) => e.stopPropagation()}
          >
            ↓ Download
          </a>
        </div>
      </div>
    </div>
  );
}

export default function PhotoComparison({
  photos,
  leftId,
  rightId,
  onClose,
  onChangeLeft,
  onChangeRight,
}) {
  const [focusedPanel, setFocusedPanel] = useState('left');
  const overlayRef = useRef(null);

  const leftPhoto = photos.find((p) => p.id === leftId) ?? null;
  const rightPhoto = photos.find((p) => p.id === rightId) ?? null;

  function getAdjacentId(currentId, direction) {
    const idx = photos.findIndex((p) => p.id === currentId);
    if (idx === -1) return photos[0]?.id ?? null;
    const next =
      direction === 'next' ? (idx + 1) % photos.length : (idx - 1 + photos.length) % photos.length;
    return photos[next]?.id ?? null;
  }

  function handlePrevLeft() {
    const id = getAdjacentId(leftId, 'prev');
    if (id != null) onChangeLeft(id);
  }
  function handleNextLeft() {
    const id = getAdjacentId(leftId, 'next');
    if (id != null) onChangeLeft(id);
  }
  function handlePrevRight() {
    const id = getAdjacentId(rightId, 'prev');
    if (id != null) onChangeRight(id);
  }
  function handleNextRight() {
    const id = getAdjacentId(rightId, 'next');
    if (id != null) onChangeRight(id);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        if (focusedPanel === 'left') handlePrevLeft();
        else handlePrevRight();
      }
      if (e.key === 'ArrowRight') {
        if (focusedPanel === 'left') handleNextLeft();
        else handleNextRight();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedPanel, leftId, rightId, photos]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div className="comparison-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="comparison-container">
        <button className="comparison-close" onClick={onClose} aria-label="Close">
          &#10005;
        </button>
        <div className="comparison-panels">
          <ComparisonPanel
            photo={leftPhoto}
            photos={photos}
            onChangePrev={handlePrevLeft}
            onChangeNext={handleNextLeft}
            focused={focusedPanel === 'left'}
            onFocus={() => setFocusedPanel('left')}
          />
          <div className="comparison-divider" />
          <ComparisonPanel
            photo={rightPhoto}
            photos={photos}
            onChangePrev={handlePrevRight}
            onChangeNext={handleNextRight}
            focused={focusedPanel === 'right'}
            onFocus={() => setFocusedPanel('right')}
          />
        </div>
      </div>
    </div>
  );
}
