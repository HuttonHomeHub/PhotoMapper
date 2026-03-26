import { useState } from 'react'
import { usePhotos } from './hooks/usePhotos.js'
import { DropZone } from './components/DropZone.jsx'
import { PhotoMap } from './components/PhotoMap.jsx'
import { PhotoList } from './components/PhotoList.jsx'

export function App() {
  const { photos, loading, refresh, deletePhoto } = usePhotos()
  const gpsCount = photos.filter(p => p.hasGps).length
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filteredPhotos = (dateFrom || dateTo)
    ? photos.filter(p => {
        if (!p.dateTaken) return false
        const date = p.dateTaken.slice(0, 10)
        if (dateFrom && date < dateFrom) return false
        if (dateTo && date > dateTo) return false
        return true
      })
    : photos

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Photo Map</h1>
          <p>Upload photos with GPS EXIF data</p>
        </div>

        <DropZone onUploadComplete={refresh} />

        {!loading && (
          <div className="photo-count">
            {gpsCount} photo{gpsCount !== 1 ? 's' : ''} on map
            {photos.length > gpsCount ? ` · ${photos.length - gpsCount} without GPS` : ''}
          </div>
        )}

        <div className="date-filter">
          <div className="date-filter-row">
            <label className="date-filter-label">
              From
              <input
                type="date"
                className="date-filter-input"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </label>
            <label className="date-filter-label">
              To
              <input
                type="date"
                className="date-filter-input"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </label>
          </div>
          {(dateFrom || dateTo) && (
            <button className="date-filter-clear" onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Clear filter
            </button>
          )}
        </div>

        <PhotoList photos={filteredPhotos} onDelete={deletePhoto} />
      </aside>

      <PhotoMap photos={filteredPhotos} onDelete={deletePhoto} />
    </div>
  )
}
