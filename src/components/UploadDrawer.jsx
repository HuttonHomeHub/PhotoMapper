import { useEffect, useRef, useState } from 'react'

const statusIcon = {
  uploading: '●',
  success: '✓',
  'no-gps': '!',
  error: '✕',
  duplicate: '⊘'
}

export function UploadDrawer({ results, open, onClose, onClear, onAllDone }) {
  const [keepOpen, setKeepOpen] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setKeepOpen(false)
      return
    }
    if (results.length === 0) return
    const allDone = results.every(r => r.status !== 'uploading')
    if (allDone && !keepOpen) {
      timerRef.current = setTimeout(() => onAllDone?.(), 4000)
    }
    return () => clearTimeout(timerRef.current)
  }, [open, results, keepOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const allDone = results.length > 0 && results.every(r => r.status !== 'uploading')

  return (
    <div className={`upload-drawer${open ? ' open' : ''}`}>
      <div className="upload-drawer-header">
        <span>Upload Log</span>
        <div className="upload-drawer-actions">
          {results.length > 0 && (
            <button className="upload-drawer-clear" onClick={onClear}>Clear</button>
          )}
          <button className="upload-drawer-close" onClick={onClose}>×</button>
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
          onClick={() => { setKeepOpen(true); clearTimeout(timerRef.current) }}
        >
          Keep open
        </button>
      )}
    </div>
  )
}
