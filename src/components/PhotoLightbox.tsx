import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type { Photo } from '../../shared/api.ts';
import type { PhotoEdit } from '../hooks/usePhotos.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { formatDate } from '../lib/format.ts';

function ExifItem({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  if (value == null) return null;
  return (
    <div className={`lightbox-exif-item${full ? ' lightbox-exif-item--full' : ''}`}>
      <span className="lightbox-exif-label">{label}</span>
      <span className="lightbox-exif-value">{value}</span>
    </div>
  );
}

export interface PhotoLightboxProps {
  photo: Photo;
  photos: Photo[];
  /** Closes with null, or moves to another photo. */
  onClose: (next: Photo | null) => void;
  onUpdate?: (id: string, fields: PhotoEdit) => Promise<unknown>;
}

export function PhotoLightbox({ photo, photos, onClose, onUpdate }: PhotoLightboxProps) {
  const idx = photos.findIndex((p) => p.id === photo.id);
  const [copied, setCopied] = useState(false);
  const [description, setDescription] = useState(photo.description ?? '');
  const [tags, setTags] = useState<string[]>(photo.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [surveyDate, setSurveyDate] = useState(photo.surveyDate ?? '');
  const trapRef = useFocusTrap(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [savedState, setSavedState] = useState<'saving' | 'saved' | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Moving to another photo shows that photo's notes, tags and survey date.
  const [shownId, setShownId] = useState(photo.id);
  if (photo.id !== shownId) {
    setShownId(photo.id);
    setDescription(photo.description ?? '');
    setTags(photo.tags ?? []);
    setTagInput('');
    setSurveyDate(photo.surveyDate ?? '');
    setCopied(false);
  }

  function prev() {
    const i = (idx - 1 + photos.length) % photos.length;
    onClose(photos[i] ?? null);
  }

  function next() {
    const i = (idx + 1) % photos.length;
    onClose(photos[i] ?? null);
  }

  function copyCoords() {
    void navigator.clipboard.writeText(`${photo.lat?.toFixed(5)}, ${photo.lng?.toFixed(5)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const scheduleSave = useCallback(
    (newDesc: string, newTags: string[], newSurveyDate: string) => {
      clearTimeout(saveTimerRef.current);
      setSavedState('saving');
      saveTimerRef.current = setTimeout(() => {
        void onUpdate?.(photo.id, {
          description: newDesc,
          tags: newTags,
          surveyDate: newSurveyDate || null,
        });
        setSavedState('saved');
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSavedState(null), 2000);
      }, 600);
    },
    [photo.id, onUpdate]
  );

  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      clearTimeout(savedTimerRef.current);
    };
  }, []);

  function handleDescriptionChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setDescription(val);
    scheduleSave(val, tags, surveyDate);
  }

  function handleTagKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  }

  function addTag() {
    const trimmed = tagInput.trim().replace(/,+$/, '');
    if (!trimmed || tags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    const newTags = [...tags, trimmed];
    setTags(newTags);
    setTagInput('');
    scheduleSave(description, newTags, surveyDate);
  }

  function removeTag(tag: string) {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    scheduleSave(description, newTags, surveyDate);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(null);
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo, photos]); // eslint-disable-line react-hooks/exhaustive-deps

  const cameraLabel = [photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ') || null;

  return (
    <div className="lightbox-overlay" onClick={() => onClose(null)}>
      {photos.length > 1 && (
        <button
          className="lightbox-nav lightbox-nav-prev"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Previous photo"
        >
          &#8249;
        </button>
      )}

      <div className="lightbox-box" ref={trapRef} onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={() => onClose(null)} aria-label="Close">
          &#10005;
        </button>

        <img className="lightbox-img" src={`/uploads/${photo.filename}`} alt={photo.originalName} />

        <div className="lightbox-body">
          {/* Filename + location strip */}
          <div className="lightbox-info-bar">
            <div className="lightbox-title">{photo.originalName}</div>
            {photo.locationName && <div className="lightbox-location">{photo.locationName}</div>}
          </div>

          {/* EXIF data grid */}
          <div className="lightbox-exif-grid">
            <ExifItem label="Taken" value={formatDate(photo.dateTaken)} />
            <ExifItem label="Camera" value={cameraLabel} />
            <ExifItem
              label="Focal length"
              value={photo.focalLength != null ? `${photo.focalLength}mm` : null}
            />
            <ExifItem
              label="Aperture"
              value={photo.fNumber != null ? `f/${photo.fNumber}` : null}
            />
            <ExifItem label="ISO" value={photo.iso} />
            <ExifItem label="Exposure" value={photo.exposureTime} />
            <ExifItem
              label="Altitude"
              value={photo.altitude != null ? `${Math.round(photo.altitude)}m` : null}
            />
            <ExifItem
              label="Direction"
              value={photo.imgDirection != null ? `${Math.round(photo.imgDirection)}°` : null}
            />
            {photo.hasGps && photo.lat != null && photo.lng != null && (
              <ExifItem
                full
                label="GPS"
                value={`${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}`}
              />
            )}
            {!photo.hasGps && <ExifItem full label="GPS" value="No GPS data" />}
            {photo.hasGps && photo.lat != null && photo.lng != null && (
              <div className="lightbox-gps-actions">
                <button className="lightbox-gps-btn" onClick={copyCoords}>
                  {copied ? '✓ Copied' : 'Copy coords'}
                </button>
                <a
                  href={`https://www.google.com/maps?q=${photo.lat},${photo.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="lightbox-gps-btn"
                >
                  Open in Maps
                </a>
              </div>
            )}
            <div className="lightbox-exif-item lightbox-exif-item--full lightbox-survey-date-row">
              <span className="lightbox-exif-label">Survey Date</span>
              <input
                type="date"
                className="lightbox-survey-date-input"
                value={surveyDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setSurveyDate(val);
                  scheduleSave(description, tags, val);
                }}
              />
            </div>
          </div>

          {/* Field notes + tags */}
          <div className="lightbox-notes">
            <div className="lightbox-field-label">
              Field Notes
              {savedState === 'saving' && <span className="save-indicator saving">saving…</span>}
              {savedState === 'saved' && <span className="save-indicator saved">✓ Saved</span>}
            </div>
            <textarea
              className="lightbox-notes-input"
              placeholder="Add observation notes…"
              value={description}
              onChange={handleDescriptionChange}
              rows={3}
            />
            <div className="lightbox-tags-row">
              {tags.map((tag) => (
                <span key={tag} className="tag-chip">
                  {tag}
                  <button
                    className="tag-chip-remove"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="tag-input"
                placeholder="Add tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
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
        <button
          className="lightbox-nav lightbox-nav-next"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Next photo"
        >
          &#8250;
        </button>
      )}
    </div>
  );
}
