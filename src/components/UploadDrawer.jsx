const statusIcon = {
  uploading: '⏳',
  success: '✓',
  'no-gps': '⚠',
  error: '✕',
  duplicate: '⊘'
}

export function UploadDrawer({ results, open, onClose, onClear }) {
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
    </div>
  )
}
