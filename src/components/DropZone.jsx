import { useState, useRef } from 'react'

async function hashFile(file) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function DropZone({ onUploadComplete }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  async function uploadFile(file) {
    const hash = await hashFile(file)

    const checkRes = await fetch(`/api/photos/check-hash?hash=${hash}`)
    if (checkRes.ok) {
      const err = new Error('Already uploaded')
      err.isDuplicate = true
      throw err
    }

    const formData = new FormData()
    formData.append('photo', file)

    const res = await fetch('/api/photos', { method: 'POST', body: formData })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        const err = new Error('Already uploaded')
        err.isDuplicate = true
        throw err
      }
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    return res.json()
  }

  async function processFiles(fileList) {
    const files = Array.from(fileList)
    if (!files.length) return

    // Add pending entries
    const entries = files.map(f => ({ name: f.name, status: 'uploading' }))
    setResults(prev => [...entries, ...prev])

    const updates = await Promise.all(
      files.map(async (file, i) => {
        try {
          const photo = await uploadFile(file)
          return { index: i, status: photo.hasGps ? 'success' : 'no-gps', detail: photo.hasGps ? null : 'No GPS data — pin not shown on map' }
        } catch (err) {
          if (err.isDuplicate) return { index: i, status: 'duplicate', detail: 'Already uploaded' }
          return { index: i, status: 'error', detail: err.message }
        }
      })
    )

    setResults(prev => {
      const next = [...prev]
      const offset = prev.length - files.length // new entries are at the front
      // The new entries are at indices 0..files.length-1 in `prev`
      updates.forEach(({ index, status, detail }) => {
        next[index] = { ...next[index], status, detail }
      })
      return next
    })

    if (updates.some(u => u.status !== 'duplicate')) onUploadComplete()
  }

  function onDragOver(e) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function onDragLeave() {
    setIsDragOver(false)
  }

  function onDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    processFiles(e.dataTransfer.files)
  }

  function onClick() {
    inputRef.current?.click()
  }

  function onInputChange(e) {
    processFiles(e.target.files)
    e.target.value = ''
  }

  const statusIcon = {
    uploading: '⏳',
    success: '✓',
    'no-gps': '⚠',
    error: '✕',
    duplicate: '⊘'
  }

  return (
    <>
      <div
        className={`dropzone${isDragOver ? ' active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onClick()}
      >
        <div className="dropzone-icon">📷</div>
        <p>
          <strong>Drop photos here</strong><br />
          or click to browse<br />
          JPEG · PNG · HEIC · WebP
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/heic,image/webp"
          onChange={onInputChange}
        />
      </div>

      {results.length > 0 && (
        <div className="upload-results">
          {results.map((r, i) => (
            <div key={i} className={`upload-item ${r.status}`}>
              <span className="status-icon">{statusIcon[r.status]}</span>
              <div>
                <div className="name">{r.name}</div>
                {r.detail && <div className="detail">{r.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
