import { usePhotos } from './hooks/usePhotos.js'
import { DropZone } from './components/DropZone.jsx'
import { PhotoMap } from './components/PhotoMap.jsx'

export function App() {
  const { photos, loading, refresh } = usePhotos()
  const gpsCount = photos.filter(p => p.hasGps).length

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
      </aside>

      <PhotoMap photos={photos} />
    </div>
  )
}
