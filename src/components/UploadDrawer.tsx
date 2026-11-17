import { useEffect, useRef, useState } from 'react';

export type UploadStatus = 'uploading' | 'success' | 'no-gps' | 'error' | 'duplicate';

export interface UploadResult {
  id: string;
  name: string;
  status: UploadStatus;
  detail?: string | null | undefined;
}

const statusIcon: Record<UploadStatus, string> = {
  uploading: '●',
  success: '✓',
  'no-gps': '!',
  error: '✕',
  duplicate: '⊘',
};

export interface UploadDrawerProps {
  results: UploadResult[];
  open: boolean;
  onClose: () => void;
  onClear: () => void;
  onAllDone?: () => void;
}

export function UploadDrawer({ results, open, onClose, onClear, onAllDone }: UploadDrawerProps) {
  const [keepOpen, setKeepOpen] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onAllDoneRef = useRef(onAllDone);
  useEffect(() => {
    onAllDoneRef.current = onAllDone;
  });

  // "Keep open" lasts until the drawer closes.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setKeepOpen(false);
  }

  const allDone = results.length > 0 && results.every((r) => r.status !== 'uploading');

  // Once every upload has finished, close after a pause unless asked to stay open.
  useEffect(() => {
    if (!open || !allDone || keepOpen) return;
    timerRef.current = setTimeout(() => onAllDoneRef.current?.(), 4000);
    return () => clearTimeout(timerRef.current);
  }, [open, allDone, results, keepOpen]);

  return (
    <div className={`upload-drawer${open ? ' open' : ''}`}>
      <div className="upload-drawer-header">
        <span>{allDone ? 'Upload complete' : 'Uploading…'}</span>
        <div className="upload-drawer-actions">
          {results.length > 0 && (
            <button className="upload-drawer-clear" onClick={onClear}>
              Clear
            </button>
          )}
          <button className="upload-drawer-close" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div className="upload-results">
        {results.map((r) => (
          <div key={r.id} className={`upload-item ${r.status}`}>
            <span className="status-icon">{statusIcon[r.status]}</span>
            <div>
              <div className="name">{r.name}</div>
              {r.detail && <div className="detail">{r.detail}</div>}
            </div>
          </div>
        ))}
      </div>
      {allDone && !keepOpen && (
        <button
          className="upload-keep-open"
          onClick={() => {
            setKeepOpen(true);
            clearTimeout(timerRef.current);
          }}
        >
          Keep open
        </button>
      )}
    </div>
  );
}
