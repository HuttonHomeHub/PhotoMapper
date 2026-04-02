import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { MarkerClusterGroup } from 'leaflet.markercluster'
import HeatmapOverlay from 'leaflet-heatmap'
import mapIconUrl from '../assets/map.svg'

// Fix Leaflet's default icon path issues with bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href
})


function fovGroundRadius(photo) {
  const DEFAULT_RADIUS = 100
  const fl = photo.focalLength
  if (!fl || fl <= 0) return DEFAULT_RADIUS
  const hFovRad = 2 * Math.atan(18 / fl)
  const height = photo.altitude != null && photo.altitude > 1.5 ? photo.altitude : 50
  const groundRadius = Math.tan(hFovRad / 2) * height
  return Math.max(10, Math.min(groundRadius, 5000))
}

function syntheticPoints(lat, lng, radiusMeters, n) {
  const R = 6371000
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const points = [{ lat, lng, value: 1 }]
  const ringR = radiusMeters * 0.6
  for (let i = 0; i < n - 1; i++) {
    const angle = (2 * Math.PI * i) / (n - 1)
    const dLat = ((ringR * Math.cos(angle)) / R) * (180 / Math.PI)
    const dLng = ((ringR * Math.sin(angle)) / (R * cosLat)) * (180 / Math.PI)
    points.push({ lat: lat + dLat, lng: lng + dLng, value: 1 })
  }
  return points
}

function createFovConePolygon(photo) {
  if (photo.imgDirection == null || !photo.focalLength) return null
  const fl = photo.focalLength
  const height = photo.altitude ?? 50
  const hFovRad = 2 * Math.atan(18 / fl)
  const groundRadius = Math.max(10, Math.min(Math.tan(hFovRad / 2) * height, 5000))
  const halfAngle = hFovRad / 2
  const dirRad = (photo.imgDirection * Math.PI) / 180
  const R = 6371000
  const lat1 = (photo.lat * Math.PI) / 180
  const lng1 = (photo.lng * Math.PI) / 180
  const numPoints = 20
  const vertices = []
  for (let i = 0; i <= numPoints; i++) {
    const bearing = dirRad - halfAngle + (i / numPoints) * hFovRad
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(groundRadius / R) +
      Math.cos(lat1) * Math.sin(groundRadius / R) * Math.cos(bearing)
    )
    const lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(groundRadius / R) * Math.cos(lat1),
      Math.cos(groundRadius / R) - Math.sin(lat1) * Math.sin(lat2)
    )
    vertices.push([(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI])
  }
  return L.polygon([[photo.lat, photo.lng], ...vertices, [photo.lat, photo.lng]], {
    color: '#87ceeb',
    weight: 1,
    opacity: 0.6,
    fillColor: '#87ceeb',
    fillOpacity: 0.12,
    dashArray: '4 2',
    interactive: false
  })
}

function escapeHtml(str) {
  if (!str) return str
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
    rows.push(['Camera', [photo.cameraMake, photo.cameraModel].filter(Boolean).map(escapeHtml).join(' ')])
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
    rows.push(['Exposure', escapeHtml(photo.exposureTime)])
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

  const mapsLink = (photo.hasGps && photo.lat != null && photo.lng != null)
    ? `<a href="https://www.google.com/maps?q=${photo.lat},${photo.lng}" target="_blank" rel="noreferrer" class="popup-maps-link">Open in Google Maps ↗</a>`
    : ''

  return `
    <div class="popup-content">
      <div class="popup-title">${escapeHtml(photo.originalName)}</div>
      ${rowsHtml}
      <div class="popup-actions">
        <button class="popup-view-btn" data-id="${photo.id}">View photo</button>
        <button class="popup-delete-btn" data-id="${photo.id}">Delete photo</button>
      </div>
      ${mapsLink}
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
          <img src="/uploads/${photo.thumbnailFilename ?? photo.filename}" alt="" loading="lazy" />
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
  let size
  if (count < 5) {
    size = 'xs'
  } else if (count < 10) {
    size = 'sm'
  } else if (count < 25) {
    size = 'md'
  } else if (count < 100) {
    size = 'lg'
  } else {
    size = 'xl'
  }
  return L.divIcon({
    html: `<div class="cluster-icon cluster-${size}" style="width:36px;height:36px"><span>${count}</span></div>`,
    className: '',
    iconSize: L.point(36, 36)
  })
}

export const PhotoMap = forwardRef(function PhotoMap({ photos, onDelete, onView, hoveredPhotoId, onPhotoHover, onRegionChange }, ref) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const clusterGroupRef = useRef(null)
  const heatmapLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const regionLayerRef = useRef(null)
  const markersRef = useRef({})
  const fovLayersRef = useRef({})
  const onDeleteRef = useRef(onDelete)
  const onViewRef = useRef(onView)
  const onRegionChangeRef = useRef(onRegionChange)
  const onPhotoHoverRef = useRef(onPhotoHover)
  const photosRef = useRef(photos)
  const prevGeoCountRef = useRef(0)

  const [heatmapActive, setHeatmapActive] = useState(false)
  const [heatExtrema, setHeatExtrema] = useState(null)
  const [heatControlEl, setHeatControlEl] = useState(null)
  const [activeLayer, setActiveLayer] = useState('Satellite')
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [showRoute, setShowRoute] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [hasRegion, setHasRegion] = useState(false)
  const [fovVisible, setFovVisible] = useState(false)
  const layersRef = useRef({})
  const drawStateRef = useRef({ active: false, vertices: [], previewLayer: null })

  useEffect(() => { onDeleteRef.current = onDelete }, [onDelete])
  useEffect(() => { onViewRef.current = onView }, [onView])
  useEffect(() => { onRegionChangeRef.current = onRegionChange }, [onRegionChange])
  useEffect(() => { onPhotoHoverRef.current = onPhotoHover }, [onPhotoHover])
  useEffect(() => { photosRef.current = photos }, [photos])

  // Initialise map once
  useEffect(() => {
    if (mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [54.5, -3],
      zoom: 5,
      zoomControl: true
    })

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
      }
    )

    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    })

    const dark = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19
      }
    )

    const terrain = L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      {
        attribution: 'Map data: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: © <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17
      }
    )

    satellite.addTo(map)
    layersRef.current = { Satellite: satellite, Streets: streets, Dark: dark, Terrain: terrain }

    map.on('baselayerchange', (e) => setActiveLayer(e.name))

    const HeatmapControlClass = L.Control.extend({
      onAdd() {
        const el = L.DomUtil.create('div')
        L.DomEvent.disableClickPropagation(el)
        L.DomEvent.disableScrollPropagation(el)
        setHeatControlEl(el)
        return el
      }
    })
    new HeatmapControlClass({ position: 'topright' }).addTo(map)

    const clusterGroup = new MarkerClusterGroup({
      maxClusterRadius: 80,
      spiderfyOnMaxZoom: false,
      spiderfyDistanceMultiplier: 2,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: createClusterIcon
    })

    clusterGroup.on('clusterclick', (e) => {
      const cluster = e.layer
      const currentZoom = map.getZoom()
      const maxZoom = map.getMaxZoom()
      const bounds = cluster.getBounds()
      const ne = bounds.getNorthEast()
      const sw = bounds.getSouthWest()
      const isPoint = Math.abs(ne.lat - sw.lat) < 1e-5 && Math.abs(ne.lng - sw.lng) < 1e-5

      if (currentZoom >= maxZoom || isPoint) {
        cluster.spiderfy()
      } else {
        map.fitBounds(bounds, { padding: [40, 40] })
      }
    })

    map.addLayer(clusterGroup)

    const heatmapLayer = new HeatmapOverlay({
      radius: 32,
      maxOpacity: 0.82,
      minOpacity: 0.05,
      scaleRadius: false,
      useLocalExtrema: true,
      latField: 'lat',
      lngField: 'lng',
      valueField: 'value',
      gradient: {
        0.0: 'rgba(0,0,255,0)',
        0.25: 'blue',
        0.45: 'cyan',
        0.65: 'lime',
        0.80: 'yellow',
        1.0: 'red'
      }
    })

    mapInstanceRef.current = map
    clusterGroupRef.current = clusterGroup
    heatmapLayerRef.current = heatmapLayer

    return () => {
      setHeatControlEl(null)
      map.remove()
      mapInstanceRef.current = null
      clusterGroupRef.current = null
      heatmapLayerRef.current = null
      routeLayerRef.current = null
    }
  }, [])

  // Expose flyTo and getBounds to parent via ref
  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, zoom) {
      mapInstanceRef.current?.flyTo([lat, lng], zoom)
    },
    getBounds() {
      return mapInstanceRef.current?.getBounds() ?? null
    }
  }))

  // Highlight hovered marker from elevation chart
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement()
      if (!el) return
      el.classList.toggle('pin-highlighted', id === hoveredPhotoId)
    })
  }, [hoveredPhotoId])

  // Toggle between markers and heatmap
  useEffect(() => {
    const map = mapInstanceRef.current
    const clusterGroup = clusterGroupRef.current
    const heatmapLayer = heatmapLayerRef.current
    if (!map || !clusterGroup || !heatmapLayer) return

    if (heatmapActive) {
      if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup)
      if (!map.hasLayer(heatmapLayer)) heatmapLayer.addTo(map)
      if (heatmapLayer._heatmap) {
        heatmapLayer._heatmap.configure({
          onExtremaChange: (data) => setHeatExtrema({ min: data.min, max: data.max })
        })
      }
    } else {
      if (map.hasLayer(heatmapLayer)) map.removeLayer(heatmapLayer)
      if (!map.hasLayer(clusterGroup)) map.addLayer(clusterGroup)
      setHeatExtrema(null)
    }
  }, [heatmapActive])

  // Update heatmap data when photos change
  useEffect(() => {
    const heatmapLayer = heatmapLayerRef.current
    if (!heatmapLayer) return

    const geoPhotos = photos.filter(p => p.hasGps && p.lat != null && p.lng != null)

    if (!geoPhotos.length) {
      heatmapLayer.setData({ max: 1, data: [] })
      return
    }

    const data = geoPhotos.map(p => ({ lat: p.lat, lng: p.lng, value: 0.35 }))
    heatmapLayer.setData({ max: 1, data })
  }, [photos])

  // Draw or remove trip route polyline
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }

    if (!showRoute) return

    const geoPhotos = photos
      .filter(p => p.hasGps && p.lat != null && p.lng != null)
      .sort((a, b) => {
        const dateA = a.dateTaken || a.uploadedAt || ''
        const dateB = b.dateTaken || b.uploadedAt || ''
        return dateA.localeCompare(dateB)
      })

    if (geoPhotos.length < 2) return

    const coords = geoPhotos.map(p => [p.lat, p.lng])
    const polyline = L.polyline(coords, {
      color: '#e97b25',
      weight: 2,
      opacity: 0.65,
      dashArray: '6 4'
    })
    polyline.addTo(map)
    routeLayerRef.current = polyline
  }, [showRoute, photos])

  // Toggle FOV cone visibility
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    Object.values(fovLayersRef.current).forEach(poly => {
      if (fovVisible) {
        if (!map.hasLayer(poly)) poly.addTo(map)
      } else {
        if (map.hasLayer(poly)) map.removeLayer(poly)
      }
    })
  }, [fovVisible])

  // Draw region mode
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const ds = drawStateRef.current
    ds.active = drawMode

    if (!drawMode) {
      // Clean up preview layer if draw mode was cancelled without completing
      if (ds.previewLayer) {
        map.removeLayer(ds.previewLayer)
        ds.previewLayer = null
      }
      ds.vertices = []
      map.getContainer().style.cursor = ''
      map.off('click', onMapClick)
      map.off('dblclick', onMapDblClick)
      return
    }

    map.getContainer().style.cursor = 'crosshair'
    ds.vertices = []

    function onMapClick(e) {
      if (!ds.active) return
      ds.vertices.push(e.latlng)

      if (ds.previewLayer) map.removeLayer(ds.previewLayer)
      if (ds.vertices.length >= 2) {
        ds.previewLayer = L.polygon(ds.vertices, {
          color: '#e97b25',
          weight: 2,
          fillOpacity: 0.1,
          dashArray: '6 4'
        }).addTo(map)
      }
    }

    function onMapDblClick(e) {
      if (!ds.active || ds.vertices.length < 3) return
      L.DomEvent.stopPropagation(e)

      // Remove the last point added by the click that precedes dblclick
      ds.vertices.pop()

      if (ds.previewLayer) {
        map.removeLayer(ds.previewLayer)
        ds.previewLayer = null
      }

      // Finalise region
      const finalPoly = L.polygon(ds.vertices, {
        color: '#e97b25',
        weight: 2,
        fillOpacity: 0.08
      }).addTo(map)

      if (regionLayerRef.current) map.removeLayer(regionLayerRef.current)
      regionLayerRef.current = finalPoly

      const latLngs = ds.vertices.map(ll => ({ lat: ll.lat, lng: ll.lng }))
      onRegionChangeRef.current?.(latLngs)
      setHasRegion(true)
      setDrawMode(false)
    }

    map.on('click', onMapClick)
    map.on('dblclick', onMapDblClick)

    return () => {
      map.off('click', onMapClick)
      map.off('dblclick', onMapDblClick)
    }
  }, [drawMode])

  const photoIds = photos.map(p => p.id).join(',')

  // Rebuild markers when photos change
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current
    const map = mapInstanceRef.current
    if (!clusterGroup || !map) return

    clusterGroup.clearLayers()
    markersRef.current = {}

    Object.values(fovLayersRef.current).forEach(poly => {
      if (map.hasLayer(poly)) map.removeLayer(poly)
    })
    fovLayersRef.current = {}

    const geoPhotos = photos.filter(p => p.hasGps && p.lat != null && p.lng != null)

    if (!geoPhotos.length) {
      prevGeoCountRef.current = 0
      map.setView([54.5, -3], 5)
      return
    }

    geoPhotos.forEach(photo => {
      const marker = L.marker([photo.lat, photo.lng], {
        icon: createPhotoIcon(photo)
      })
      markersRef.current[photo.id] = marker

      const popup = L.popup({ maxWidth: 280 }).setContent(buildPopupHtml(photo))

      popup.on('add', () => {
        const el = popup.getElement()
        if (!el) return

        const viewBtn = el.querySelector('.popup-view-btn')
        if (viewBtn) {
          viewBtn.addEventListener('click', () => {
            onViewRef.current?.(photo)
          }, { once: true })
        }

        const deleteBtn = el.querySelector('.popup-delete-btn')
        if (!deleteBtn) return
        deleteBtn.addEventListener('click', async () => {
          if (!window.confirm('Delete this photo? This cannot be undone.')) return
          deleteBtn.disabled = true
          deleteBtn.textContent = 'Deleting\u2026'
          try {
            await onDeleteRef.current(photo.id)
            marker.closePopup()
          } catch (err) {
            deleteBtn.disabled = false
            deleteBtn.textContent = 'Delete photo'
            alert(`Could not delete: ${err.message}`)
          }
        }, { once: true })
      })

      marker.on('mouseover', () => onPhotoHoverRef.current?.(photo.id))
      marker.on('mouseout', () => onPhotoHoverRef.current?.(null))
      marker.bindPopup(popup)
      clusterGroup.addLayer(marker)

      const fovPoly = createFovConePolygon(photo)
      if (fovPoly) {
        fovLayersRef.current[photo.id] = fovPoly
        if (fovVisible) fovPoly.addTo(map)
      }
    })

    // Fit map to show all pins only when transitioning from no photos to some
    if (prevGeoCountRef.current === 0) {
      const bounds = L.latLngBounds(geoPhotos.map(p => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
    }
    prevGeoCountRef.current = geoPhotos.length
  }, [photoIds, fovVisible])

  useEffect(() => {
    if (heatmapActive && !photos.some(p => p.hasGps && p.lat != null && p.lng != null)) {
      setHeatmapActive(false)
    }
  }, [photos, heatmapActive])

  function clearRegion() {
    const map = mapInstanceRef.current
    if (regionLayerRef.current && map) {
      map.removeLayer(regionLayerRef.current)
      regionLayerRef.current = null
    }
    setHasRegion(false)
    setDrawMode(false)
    onRegionChangeRef.current?.(null)
  }

  const hasGeoPhotos = photos.some(p => p.hasGps && p.lat != null && p.lng != null)

  function switchLayer(name) {
    const map = mapInstanceRef.current
    if (!map) return
    const layers = layersRef.current
    Object.entries(layers).forEach(([n, layer]) => {
      if (n === name) { if (!map.hasLayer(layer)) layer.addTo(map) }
      else { if (map.hasLayer(layer)) map.removeLayer(layer) }
    })
    setActiveLayer(name)
    setLayerMenuOpen(false)
  }

  async function handleExport() {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(mapRef.current, { useCORS: true, allowTaint: true, logging: false })
    const link = document.createElement('a')
    link.download = 'heatmap.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const LAYER_NAMES = ['Satellite', 'Streets', 'Dark', 'Terrain']

  return (
    <>
      <div ref={mapRef} className="map-container" />
      {heatControlEl && createPortal(
        <div className="mc-panel">
          <div className="mc-section">
            <button
              className={`mc-row mc-layer-header${layerMenuOpen ? ' open' : ''}`}
              onClick={() => setLayerMenuOpen(o => !o)}
            >
              <img src={mapIconUrl} className="mc-layer-header-icon" alt="" />
              <span className="mc-layer-header-text">
                <span className="mc-layer-header-label">Map style</span>
                <span className="mc-layer-header-value">{activeLayer}</span>
              </span>
              <span className="mc-layer-header-chevron">›</span>
            </button>
            {layerMenuOpen && (
              <div className="mc-layer-menu">
                {LAYER_NAMES.map(name => (
                  <button
                    key={name}
                    className={`mc-row mc-layer-option${activeLayer === name ? ' active' : ''}`}
                    onClick={() => switchLayer(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className={`mc-row${showRoute ? ' active' : ''}`}
            onClick={() => setShowRoute(r => !r)}
          >
            Route
          </button>
          <button
            className={`mc-row${fovVisible ? ' active' : ''}`}
            onClick={() => setFovVisible(v => !v)}
            title="Toggle FOV cones"
          >
            FOV Cones
          </button>
          <div className="mc-section">
            <button
              className={`mc-row mc-section-header${heatmapActive ? ' active' : ''}`}
              onClick={() => setHeatmapActive(h => !h)}
              disabled={!hasGeoPhotos}
              title={!hasGeoPhotos ? 'Upload geotagged photos to enable heatmap' : undefined}
            >
              Heatmap
            </button>
            {heatmapActive && (
              <>
                <button
                  className="mc-row mc-row--sub"
                  onClick={handleExport}
                  title="Download heatmap as PNG"
                >
                  ↓ Export
                </button>
                <div className="mc-legend">
                  <div className="mc-legend-bar" />
                  <div className="mc-legend-labels">
                    <span>sparse</span>
                    <span>dense</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            className={`mc-row${drawMode || hasRegion ? ' active' : ''}`}
            onClick={() => {
              if (hasRegion) { clearRegion(); return }
              setDrawMode(d => !d)
            }}
            title={drawMode ? 'Click map to add vertices, double-click to finish' : hasRegion ? 'Clear region filter' : 'Draw region filter'}
          >
            {drawMode ? '✕ Cancel Draw' : hasRegion ? '✕ Clear Region' : '⬡ Draw Region'}
          </button>
          {drawMode && (
            <div className="mc-hint">Click to add points · Double-click to finish</div>
          )}
        </div>,
        heatControlEl
      )}
    </>
  )
})
