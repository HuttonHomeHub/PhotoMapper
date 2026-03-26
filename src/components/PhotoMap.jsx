import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'

// Fix Leaflet's default icon path issues with bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href
})

function formatExposure(val) {
  if (val == null) return null
  return val
}

function formatDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function buildPopupHtml(photo) {
  const rows = []

  if (photo.dateTaken) {
    rows.push(['Taken', formatDate(photo.dateTaken)])
  }
  if (photo.cameraMake || photo.cameraModel) {
    rows.push(['Camera', [photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ')])
  }
  if (photo.focalLength != null) {
    rows.push(['Focal len.', `${photo.focalLength}mm`])
  }
  if (photo.fNumber != null) {
    rows.push(['Aperture', `f/${photo.fNumber}`])
  }
  if (photo.iso != null) {
    rows.push(['ISO', photo.iso])
  }
  if (photo.exposureTime) {
    rows.push(['Exposure', photo.exposureTime])
  }
  if (photo.altitude != null) {
    rows.push(['Altitude', `${Math.round(photo.altitude)}m`])
  }
  if (photo.imgDirection != null) {
    rows.push(['Direction', `${Math.round(photo.imgDirection)}°`])
  }

  const rowsHtml = rows.map(([label, value]) => `
    <div class="popup-row">
      <span class="popup-label">${label}</span>
      <span class="popup-value">${value}</span>
    </div>
  `).join('')

  return `
    <div class="popup-content">
      <div class="popup-title">${photo.originalName}</div>
      ${rowsHtml}
      <div class="popup-actions">
        <button class="popup-delete-btn" data-id="${photo.id}">Delete photo</button>
      </div>
    </div>
  `
}

function createPhotoIcon(photo) {
  const arrowHtml = photo.imgDirection != null
    ? `<div class="pin-arrow" style="transform: rotate(${photo.imgDirection}deg)">▲</div>`
    : ''

  return L.divIcon({
    className: '',
    html: `
      <div class="photo-pin">
        <div class="pin-thumbnail">
          <img src="/uploads/${photo.filename}" alt="" loading="lazy" />
        </div>
        ${arrowHtml}
      </div>
    `,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -32]
  })
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large'
  const px = size === 'small' ? 36 : size === 'medium' ? 44 : 52
  return L.divIcon({
    html: `<div class="cluster-icon cluster-${size}"><span>${count}</span></div>`,
    className: '',
    iconSize: L.point(px, px)
  })
}

export function PhotoMap({ photos, onDelete }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const clusterGroupRef = useRef(null)
  const onDeleteRef = useRef(onDelete)

  useEffect(() => {
    onDeleteRef.current = onDelete
  }, [onDelete])

  // Initialise map once
  useEffect(() => {
    if (mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map)

    const clusterGroup = L.markerClusterGroup({
      disableClusteringAtZoom: 16,
      maxClusterRadius: 80,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: createClusterIcon
    })

    map.addLayer(clusterGroup)
    mapInstanceRef.current = map
    clusterGroupRef.current = clusterGroup

    return () => {
      map.remove()
      mapInstanceRef.current = null
      clusterGroupRef.current = null
    }
  }, [])

  // Rebuild markers when photos change
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current
    const map = mapInstanceRef.current
    if (!clusterGroup || !map) return

    clusterGroup.clearLayers()

    const geoPhotos = photos.filter(p => p.hasGps && p.lat != null && p.lng != null)

    if (!geoPhotos.length) return

    geoPhotos.forEach(photo => {
      const marker = L.marker([photo.lat, photo.lng], {
        icon: createPhotoIcon(photo)
      })

      const popup = L.popup({ maxWidth: 280 }).setContent(buildPopupHtml(photo))

      popup.on('add', () => {
        const btn = popup.getElement()?.querySelector('.popup-delete-btn')
        if (!btn) return
        btn.addEventListener('click', async () => {
          if (!window.confirm('Delete this photo? This cannot be undone.')) return
          btn.disabled = true
          btn.textContent = 'Deleting\u2026'
          try {
            await onDeleteRef.current(photo.id)
            marker.closePopup()
          } catch (err) {
            btn.disabled = false
            btn.textContent = 'Delete photo'
            alert(`Could not delete: ${err.message}`)
          }
        })
      })

      marker.bindPopup(popup)
      clusterGroup.addLayer(marker)
    })

    // On first load with photos, fit the map to show all pins
    if (geoPhotos.length > 0 && map.getZoom() === 2) {
      const bounds = L.latLngBounds(geoPhotos.map(p => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
    }
  }, [photos])

  return <div ref={mapRef} className="map-container" />
}
