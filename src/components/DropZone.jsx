import { useState, useRef, useEffect } from 'react'

async function hashFile(file) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function DropZone({ onUploadComplete, setResults, openDrawer, projects = [], activeProjectId }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId || '')
  const inputRef = useRef(null)

  useEffect(() => {
    setSelectedProjectId(activeProjectId || '')
  }, [activeProjectId])

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
    if (selectedProjectId) formData.append('projectId', selectedProjectId)

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
    const entries = files.map(f => ({ id: crypto.randomUUID(), name: f.name, status: 'uploading' }))
    setResults(entries)
    openDrawer()

    const updates = await Promise.all(
      files.map(async (file, i) => {
        const id = entries[i].id
        try {
          const photo = await uploadFile(file)
          return { id, status: photo.hasGps ? 'success' : 'no-gps', detail: photo.hasGps ? null : 'No GPS data — pin not shown on map' }
        } catch (err) {
          if (err.isDuplicate) return { id, status: 'duplicate', detail: 'Already uploaded' }
          return { id, status: 'error', detail: err.message }
        }
      })
    )

    setResults(prev => prev.map(e => {
      const update = updates.find(u => u.id === e.id)
      return update ? { ...e, status: update.status, detail: update.detail } : e
    }))

    if (updates.some(u => u.status === 'success' || u.status === 'no-gps')) onUploadComplete()
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

  return (
    <div className="dropzone-wrapper">
      {projects.length > 0 && (
        <div className="project-selector-row" onClick={e => e.stopPropagation()}>
          <select
            className="project-selector"
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
          >
            <option value="">No project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
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
        <div className="dropzone-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 16.5V9.75M12 9.75l3 3M12 9.75l-3 3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 15a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4M6.5 12.5a4 4 0 0 1-.38-5.83A5.5 5.5 0 0 1 16.9 5.27 4.5 4.5 0 0 1 19.5 13" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p>
          <strong>Drop photos here</strong> or click to browse<br />
          <span className="dropzone-formats">JPEG · PNG · HEIC · WebP</span>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/heic,image/webp"
          onChange={onInputChange}
        />
      </div>
    </div>
  )
}
