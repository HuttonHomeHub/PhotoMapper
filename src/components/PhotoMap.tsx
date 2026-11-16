import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
// The plugin attaches L.MarkerClusterGroup to Leaflet (its types describe it there).
import 'leaflet.markercluster';
import HeatmapOverlay from 'leaflet-heatmap';
import mapIconUrl from '../assets/map.svg';
import layersIconUrl from '../assets/layers.svg';
import exportIconUrl from '../assets/export.svg';
import drawIconUrl from '../assets/draw.svg';
import { createRoot } from 'react-dom/client';
import type { Photo } from '../../shared/api.ts';
import { PhotoPopup } from './PhotoPopup.tsx';
import { photoMarkerSignature } from '../lib/markerSig.ts';
import type { Bounds } from '../lib/filterPhotos.ts';
import type { LatLng } from '../lib/geo.ts';

/** A photo with a position on the map. */
type MappedPhoto = Photo & { lat: number; lng: number };

function isMapped(p: Photo): p is MappedPhoto {
  return p.hasGps && p.lat != null && p.lng != null;
}

const LAYER_NAMES = ['Satellite', 'Streets', 'Dark', 'Terrain'] as const;
type LayerName = (typeof LAYER_NAMES)[number];

/** What App.tsx can ask of the map. */
export interface PhotoMapHandle {
  flyTo(lat: number, lng: number, zoom: number): void;
  getBounds(): L.LatLngBounds | null;
  fitToBounds(photos: Photo[]): void;
}

export interface PhotoMapProps {
  photos: Photo[];
  onDelete: (id: string) => Promise<void>;
  onView: (photo: Photo) => void;
  hoveredPhotoId: string | null;
  onPhotoHover: (id: string | null) => void;
  onRegionChange: (polygon: LatLng[] | null) => void;
  onBoundsChange: (bounds: Bounds) => void;
  exportPhotos: (format: 'geojson' | 'kml') => void;
  hasGps: boolean;
  placingPhoto: Photo | null;
  onPlacePhoto: (lat: number, lng: number) => void;
  onRepositionPhoto: (id: string, lat: number, lng: number) => void;
}

// Fix Leaflet's default icon path issues with bundlers
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

// CQ-02: FOV-cone geometry constants (see docs/geo-math.md for derivations).
const ACCENT = '#e97b25';
const SENSOR_HALF_WIDTH_MM = 18; // half of a 36mm full-frame sensor
const DEFAULT_HFOV_RAD = (65 * Math.PI) / 180; // fallback when focal length is unknown
const FOV_GROUND_RADIUS_M = 40; // fixed visual wedge length (not a real distance)
const PANO_FULL_CIRCLE_DEG = 358; // ≥ this is treated as a full 360° panorama

// Build a field-of-view wedge showing where the camera pointed and how wide its
// view was. Requires a bearing (imgDirection). The horizontal FOV comes from the
// panorama metadata when present, else is estimated from the 35mm-equivalent
// focal length. See docs/geo-math.md for the formulas and the magic numbers.
function createFovConePolygon(photo: MappedPhoto): L.Circle | L.Polygon | null {
  if (photo.imgDirection == null) return null; // no bearing → nothing to point at

  const panoHFov = photo.panoHFov != null && photo.panoHFov > 0 ? photo.panoHFov : null;

  // A near-full panorama has no meaningful direction, so draw a ring instead.
  if (panoHFov !== null && panoHFov >= PANO_FULL_CIRCLE_DEG) {
    return L.circle([photo.lat, photo.lng], {
      radius: FOV_GROUND_RADIUS_M,
      color: ACCENT,
      weight: 2,
      opacity: 0.9,
      fillColor: ACCENT,
      fillOpacity: 0.2,
      interactive: false,
    });
  }

  let hFovRad: number;
  if (panoHFov !== null) {
    hFovRad = (panoHFov * Math.PI) / 180;
  } else {
    // HFOV = 2·atan((sensorWidth/2) / focalLength); using the 35mm-equivalent
    // focal length keeps the fixed full-frame sensor width correct.
    const efl = photo.focalLengthIn35mm ?? photo.focalLength;
    hFovRad = efl ? 2 * Math.atan(SENSOR_HALF_WIDTH_MM / efl) : DEFAULT_HFOV_RAD;
  }

  const groundRadius = FOV_GROUND_RADIUS_M;
  const halfAngle = hFovRad / 2;
  const dirRad = (photo.imgDirection * Math.PI) / 180;
  const R = 6371000;
  const lat1 = (photo.lat * Math.PI) / 180;
  const lng1 = (photo.lng * Math.PI) / 180;
  const numPoints = 20;
  const vertices: L.LatLngTuple[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const bearing = dirRad - halfAngle + (i / numPoints) * hFovRad;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(groundRadius / R) +
        Math.cos(lat1) * Math.sin(groundRadius / R) * Math.cos(bearing)
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(groundRadius / R) * Math.cos(lat1),
        Math.cos(groundRadius / R) - Math.sin(lat1) * Math.sin(lat2)
      );
    vertices.push([(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI]);
  }
  return L.polygon([[photo.lat, photo.lng], ...vertices, [photo.lat, photo.lng]], {
    color: ACCENT,
    weight: 2,
    opacity: 0.9,
    fillColor: ACCENT,
    fillOpacity: 0.2,
    interactive: false,
  });
}

function createPhotoIcon(photo: Photo): L.DivIcon {
  const arrowHtml =
    photo.imgDirection != null
      ? `<div class="pin-arrow" style="transform: rotate(${photo.imgDirection}deg)">▲</div>`
      : '';

  // Hand-placed pins get a distinct accent ring + badge so they read as "manually
  // positioned" rather than a real EXIF fix (FEAT: manual GPS placement).
  const manualClass = photo.manualGps ? ' photo-pin--manual' : '';
  const manualBadge = photo.manualGps
    ? '<div class="pin-manual-badge" title="Placed manually">📍</div>'
    : '';

  return L.divIcon({
    className: '',
    html: `
      <div class="photo-pin${manualClass}">
        <div class="pin-thumbnail">
          <img src="/uploads/${photo.thumbnailFilename ?? photo.filename}" alt="" loading="lazy" />
        </div>
        ${arrowHtml}
        ${manualBadge}
      </div>
    `,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -32],
  });
}

// CQ-02: cluster marker size buckets keyed by child count (ascending).
const CLUSTER_SIZE_BREAKS: Array<[number, string]> = [
  [5, 'xs'],
  [10, 'sm'],
  [25, 'md'],
  [100, 'lg'],
];

function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = CLUSTER_SIZE_BREAKS.find(([max]) => count < max)?.[1] ?? 'xl';
  return L.divIcon({
    html: `<div class="cluster-icon cluster-${size}" style="width:36px;height:36px"><span>${count}</span></div>`,
    className: '',
    iconSize: L.point(36, 36),
  });
}

export const PhotoMap = forwardRef<PhotoMapHandle, PhotoMapProps>(function PhotoMap(
  {
    photos,
    onDelete,
    onView,
    hoveredPhotoId,
    onPhotoHover,
    onRegionChange,
    onBoundsChange,
    exportPhotos,
    hasGps,
    placingPhoto,
    onPlacePhoto,
    onRepositionPhoto,
  },
  ref
) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const heatmapLayerRef = useRef<HeatmapOverlay | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const regionLayerRef = useRef<L.Polygon | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const fovLayersRef = useRef(new Map<string, L.Circle | L.Polygon>());
  const markerSigRef = useRef(new Map<string, string>());
  const fovVisibleRef = useRef(false);
  const onDeleteRef = useRef(onDelete);
  const onViewRef = useRef(onView);
  const onRegionChangeRef = useRef(onRegionChange);
  const onPhotoHoverRef = useRef(onPhotoHover);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onPlacePhotoRef = useRef(onPlacePhoto);
  const onRepositionPhotoRef = useRef(onRepositionPhoto);
  const photosRef = useRef(photos);
  const prevGeoCountRef = useRef(0);

  const [heatmapChosen, setHeatmapActive] = useState(false);
  const [heatControlEl, setHeatControlEl] = useState<HTMLElement | null>(null);
  const [legendEl, setLegendEl] = useState<HTMLElement | null>(null);
  const [exportEl, setExportEl] = useState<HTMLElement | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerName>('Satellite');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const layerBeforeOpenRef = useRef<LayerName | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [hasRegion, setHasRegion] = useState(false);
  const [fovVisible, setFovVisible] = useState(false);
  const layersRef = useRef<Partial<Record<LayerName, L.TileLayer>>>({});
  const drawStateRef = useRef<{
    active: boolean;
    vertices: L.LatLng[];
    previewLayer: L.Polygon | null;
  }>({ active: false, vertices: [], previewLayer: null });

  const hasGeoPhotos = photos.some(isMapped);
  // The heatmap needs mapped photos; with none it is off, whatever was chosen.
  const heatmapActive = heatmapChosen && hasGeoPhotos;

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);
  useEffect(() => {
    onViewRef.current = onView;
  }, [onView]);
  useEffect(() => {
    onRegionChangeRef.current = onRegionChange;
  }, [onRegionChange]);
  useEffect(() => {
    onPhotoHoverRef.current = onPhotoHover;
  }, [onPhotoHover]);
  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);
  useEffect(() => {
    onPlacePhotoRef.current = onPlacePhoto;
  }, [onPlacePhoto]);
  useEffect(() => {
    onRepositionPhotoRef.current = onRepositionPhoto;
  }, [onRepositionPhoto]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  // PERF-06: keep the latest FOV visibility in a ref so the marker-sync effect can
  // read it without depending on `fovVisible` (which would rebuild all markers).
  useEffect(() => {
    fovVisibleRef.current = fovVisible;
  }, [fovVisible]);

  // Initialise map once
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const map = L.map(mapRef.current, {
      center: [54.5, -3],
      zoom: 5,
      zoomControl: true,
    });

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
      }
    );

    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });

    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    });

    const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution:
        'Map data: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: © <a href="https://opentopomap.org">OpenTopoMap</a>',
      maxZoom: 17,
    });

    satellite.addTo(map);
    layersRef.current = { Satellite: satellite, Streets: streets, Dark: dark, Terrain: terrain };

    map.on('baselayerchange', (e) => setActiveLayer(e.name as LayerName));
    map.on('moveend', () => {
      const b = map.getBounds();
      onBoundsChangeRef.current?.({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    });

    const makeControl = (position: L.ControlPosition, setter: (el: HTMLElement) => void) => {
      const Cls = L.Control.extend({
        onAdd() {
          const el = L.DomUtil.create('div');
          L.DomEvent.disableClickPropagation(el);
          L.DomEvent.disableScrollPropagation(el);
          setter(el);
          return el;
        },
      });
      new Cls({ position }).addTo(map);
    };
    makeControl('topright', setHeatControlEl);
    makeControl('bottomleft', setLegendEl);
    makeControl('topright', setExportEl);

    const clusterGroup = new L.MarkerClusterGroup({
      maxClusterRadius: 80,
      spiderfyOnMaxZoom: false,
      spiderfyDistanceMultiplier: 2,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: createClusterIcon,
    });

    clusterGroup.on('clusterclick', (e) => {
      const cluster = (e as L.LeafletEvent & { layer: L.MarkerCluster }).layer;
      const currentZoom = map.getZoom();
      const maxZoom = map.getMaxZoom();
      const bounds = cluster.getBounds();
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const isPoint = Math.abs(ne.lat - sw.lat) < 1e-5 && Math.abs(ne.lng - sw.lng) < 1e-5;

      if (currentZoom >= maxZoom || isPoint) {
        cluster.spiderfy();
      } else {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    });

    map.addLayer(clusterGroup);

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
        0.8: 'yellow',
        1.0: 'red',
      },
    });

    mapInstanceRef.current = map;
    clusterGroupRef.current = clusterGroup;
    heatmapLayerRef.current = heatmapLayer;

    return () => {
      setHeatControlEl(null);
      map.remove();
      mapInstanceRef.current = null;
      clusterGroupRef.current = null;
      heatmapLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  // Expose flyTo, getBounds, and fitToBounds to parent via ref
  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, zoom) {
      mapInstanceRef.current?.flyTo([lat, lng], zoom);
    },
    getBounds() {
      return mapInstanceRef.current?.getBounds() ?? null;
    },
    fitToBounds(geoPhotos) {
      const map = mapInstanceRef.current;
      if (!map || !geoPhotos.length) return;
      const points = geoPhotos.filter(isMapped);
      if (!points.length) return;
      const bounds = L.latLngBounds(points.map((p) => L.latLng(p.lat, p.lng)));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    },
  }));

  // Highlight hovered marker from elevation chart
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      if (!el) return;
      el.classList.toggle('pin-highlighted', id === hoveredPhotoId);
    });
  }, [hoveredPhotoId]);

  // Toggle between markers and heatmap
  useEffect(() => {
    const map = mapInstanceRef.current;
    const clusterGroup = clusterGroupRef.current;
    const heatmapLayer = heatmapLayerRef.current;
    if (!map || !clusterGroup || !heatmapLayer) return;

    if (heatmapActive) {
      if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
      if (!map.hasLayer(heatmapLayer)) heatmapLayer.addTo(map);
    } else {
      if (map.hasLayer(heatmapLayer)) map.removeLayer(heatmapLayer);
      if (!map.hasLayer(clusterGroup)) map.addLayer(clusterGroup);
    }
  }, [heatmapActive]);

  // Update heatmap data when photos change
  useEffect(() => {
    const heatmapLayer = heatmapLayerRef.current;
    if (!heatmapLayer) return;

    const geoPhotos = photos.filter(isMapped);

    if (!geoPhotos.length) {
      heatmapLayer.setData({ max: 1, data: [] });
      return;
    }

    const data = geoPhotos.map((p) => ({ lat: p.lat, lng: p.lng, value: 0.35 }));
    heatmapLayer.setData({ max: 1, data });
  }, [photos]);

  // Draw or remove trip route polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (!showRoute) return;

    const geoPhotos = photos.filter(isMapped).sort((a, b) => {
      const dateA = a.dateTaken || a.uploadedAt || '';
      const dateB = b.dateTaken || b.uploadedAt || '';
      return dateA.localeCompare(dateB);
    });

    if (geoPhotos.length < 2) return;

    const coords = geoPhotos.map((p) => L.latLng(p.lat, p.lng));
    const polyline = L.polyline(coords, {
      color: '#e97b25',
      weight: 2,
      opacity: 0.65,
      dashArray: '6 4',
    });
    polyline.addTo(map);
    routeLayerRef.current = polyline;
  }, [showRoute, photos]);

  // Toggle FOV cone visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    fovLayersRef.current.forEach((poly) => {
      if (fovVisible) {
        if (!map.hasLayer(poly)) poly.addTo(map);
      } else {
        if (map.hasLayer(poly)) map.removeLayer(poly);
      }
    });
  }, [fovVisible]);

  // Draw region mode
  useEffect(() => {
    const current = mapInstanceRef.current;
    if (!current) return;
    const map: L.Map = current; // typed non-null for the hoisted handlers below

    const ds = drawStateRef.current;
    ds.active = drawMode;

    if (!drawMode) {
      // Clean up preview layer if draw mode was cancelled without completing
      if (ds.previewLayer) {
        map.removeLayer(ds.previewLayer);
        ds.previewLayer = null;
      }
      ds.vertices = [];
      map.getContainer().style.cursor = '';
      map.off('click', onMapClick);
      map.off('dblclick', onMapDblClick);
      return;
    }

    map.getContainer().style.cursor = 'crosshair';
    ds.vertices = [];

    function onMapClick(e: L.LeafletMouseEvent) {
      if (!ds.active) return;
      ds.vertices.push(e.latlng);

      if (ds.previewLayer) map.removeLayer(ds.previewLayer);
      if (ds.vertices.length >= 2) {
        ds.previewLayer = L.polygon(ds.vertices, {
          color: '#e97b25',
          weight: 2,
          fillOpacity: 0.1,
          dashArray: '6 4',
        }).addTo(map);
      }
    }

    function onMapDblClick(e: L.LeafletMouseEvent) {
      if (!ds.active || ds.vertices.length < 3) return;
      L.DomEvent.stopPropagation(e);

      // Remove the last point added by the click that precedes dblclick
      ds.vertices.pop();

      if (ds.previewLayer) {
        map.removeLayer(ds.previewLayer);
        ds.previewLayer = null;
      }

      // Finalise region
      const finalPoly = L.polygon(ds.vertices, {
        color: '#e97b25',
        weight: 2,
        fillOpacity: 0.08,
      }).addTo(map);

      if (regionLayerRef.current) map.removeLayer(regionLayerRef.current);
      regionLayerRef.current = finalPoly;

      const latLngs = ds.vertices.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
      onRegionChangeRef.current?.(latLngs);
      setHasRegion(true);
      setDrawMode(false);
    }

    map.on('click', onMapClick);
    map.on('dblclick', onMapDblClick);

    return () => {
      map.off('click', onMapClick);
      map.off('dblclick', onMapDblClick);
    };
  }, [drawMode]);

  // FEAT: placement mode. While a GPS-less photo is being placed, the next map
  // click assigns its coordinates. Uses a ref for the callback so entering/leaving
  // placement mode doesn't rebuild markers.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !placingPhoto) return;

    map.getContainer().style.cursor = 'crosshair';
    function onClick(e: L.LeafletMouseEvent) {
      onPlacePhotoRef.current?.(e.latlng.lat, e.latlng.lng);
    }
    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      map.getContainer().style.cursor = '';
    };
  }, [placingPhoto]);

  // PERF-06: incremental marker sync. Diff the photo set and add/remove/rebuild
  // only what changed, instead of clearing and recreating every marker (+ popup +
  // FOV cone) on any photos change. FOV visibility is toggled by its own effect,
  // so it no longer forces a full rebuild. Popups look the photo up by id at open
  // time, so editing description/tags never churns a marker.
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current;
    const map = mapInstanceRef.current;
    if (!clusterGroup || !map) return;

    const geoPhotos = photos.filter(isMapped);
    const nextIds = new Set(geoPhotos.map((p) => p.id));

    function removeMarker(id: string) {
      const marker = markersRef.current.get(id);
      if (marker && clusterGroup) {
        clusterGroup.removeLayer(marker);
        markersRef.current.delete(id);
      }
      const fov = fovLayersRef.current.get(id);
      if (fov && map) {
        if (map.hasLayer(fov)) map.removeLayer(fov);
        fovLayersRef.current.delete(id);
      }
      markerSigRef.current.delete(id);
    }

    function addMarker(photo: MappedPhoto) {
      if (!clusterGroup || !map) return;
      const marker = L.marker([photo.lat, photo.lng], {
        icon: createPhotoIcon(photo),
        // FEAT: hand-placed pins can be dragged to fine-tune their position.
        draggable: !!photo.manualGps,
      });
      markersRef.current.set(photo.id, marker);

      if (photo.manualGps) {
        marker.on('dragend', () => {
          const ll = marker.getLatLng();
          onRepositionPhotoRef.current?.(photo.id, ll.lat, ll.lng);
        });
      }

      // SEC-12: render the popup as a React component into a container div. The
      // 'add' handler resolves the latest photo by id so an edited description or
      // tag set is reflected without rebuilding the marker.
      const popup = L.popup({ maxWidth: 280 });
      const container = document.createElement('div');
      popup.setContent(container);
      let popupRoot: Root | null = null;

      popup.on('add', () => {
        const current = photosRef.current.find((p) => p.id === photo.id) ?? photo;
        popupRoot = createRoot(container);
        popupRoot.render(
          <PhotoPopup
            photo={current}
            onView={(p) => onViewRef.current?.(p)}
            onDelete={(id) => onDeleteRef.current(id)}
            onClose={() => marker.closePopup()}
          />
        );
      });
      popup.on('remove', () => {
        const root = popupRoot;
        popupRoot = null;
        // Defer unmount out of the Leaflet event so React isn't torn down mid-cycle.
        if (root) setTimeout(() => root.unmount(), 0);
      });

      marker.on('mouseover', () => onPhotoHoverRef.current?.(photo.id));
      marker.on('mouseout', () => onPhotoHoverRef.current?.(null));
      marker.bindPopup(popup);
      clusterGroup.addLayer(marker);

      const fovPoly = createFovConePolygon(photo);
      if (fovPoly) {
        fovLayersRef.current.set(photo.id, fovPoly);
        if (fovVisibleRef.current) fovPoly.addTo(map);
      }
      markerSigRef.current.set(photo.id, photoMarkerSignature(photo));
    }

    // Remove markers for photos that are gone
    for (const id of [...markersRef.current.keys()]) {
      if (!nextIds.has(id)) removeMarker(id);
    }

    // Add new markers; rebuild any whose visual signature changed
    for (const photo of geoPhotos) {
      if (markersRef.current.has(photo.id)) {
        if (markerSigRef.current.get(photo.id) === photoMarkerSignature(photo)) continue;
        removeMarker(photo.id);
      }
      addMarker(photo);
    }

    if (!geoPhotos.length) {
      prevGeoCountRef.current = 0;
      map.setView([54.5, -3], 5);
      return;
    }

    // Fit map to show all pins only when transitioning from no photos to some
    if (prevGeoCountRef.current === 0) {
      const bounds = L.latLngBounds(geoPhotos.map((p) => L.latLng(p.lat, p.lng)));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
    prevGeoCountRef.current = geoPhotos.length;
  }, [photos]);

  function clearRegion() {
    const map = mapInstanceRef.current;
    if (regionLayerRef.current && map) {
      map.removeLayer(regionLayerRef.current);
      regionLayerRef.current = null;
    }
    setHasRegion(false);
    setDrawMode(false);
    onRegionChangeRef.current?.(null);
  }

  function applyLayer(name: LayerName) {
    const map = mapInstanceRef.current;
    if (!map) return;
    const layers = layersRef.current;
    (Object.entries(layers) as Array<[LayerName, L.TileLayer]>).forEach(([n, layer]) => {
      if (n === name) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });
    setActiveLayer(name);
  }

  function openLayerMenu() {
    if (layerMenuOpen) {
      layerBeforeOpenRef.current = null;
      setLayerMenuOpen(false);
      return;
    }
    layerBeforeOpenRef.current = activeLayer;
    setLayerMenuOpen(true);
  }

  function switchLayer(name: LayerName) {
    applyLayer(name);
    layerBeforeOpenRef.current = null;
    setLayerMenuOpen(false);
  }

  function cancelLayerMenu() {
    if (layerBeforeOpenRef.current) applyLayer(layerBeforeOpenRef.current);
    layerBeforeOpenRef.current = null;
    setLayerMenuOpen(false);
  }

  async function handleExport() {
    if (!mapRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(mapRef.current, {
      useCORS: true,
      allowTaint: true,
      logging: false,
    });
    const link = document.createElement('a');
    link.download = 'map.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <>
      <div ref={mapRef} className="map-container" />
      {heatControlEl &&
        createPortal(
          <div className="mc-stack">
            <div className="mc-panel" onMouseLeave={layerMenuOpen ? cancelLayerMenu : undefined}>
              <div className="mc-section-label">
                <img src={mapIconUrl} className="mc-layer-header-icon" alt="" />
                Map style
              </div>
              <button
                className={`mc-row mc-row--picker${layerMenuOpen ? ' open' : ''}`}
                onClick={openLayerMenu}
              >
                <span>{activeLayer}</span>
                <span className="mc-row-chevron">›</span>
              </button>
              {layerMenuOpen &&
                LAYER_NAMES.filter((name) => name !== activeLayer).map((name) => (
                  <button
                    key={name}
                    className="mc-row mc-layer-option"
                    onClick={() => switchLayer(name)}
                  >
                    {name}
                  </button>
                ))}
            </div>
            <div className="mc-panel">
              <div className="mc-section-label">
                <img src={layersIconUrl} className="mc-layer-header-icon" alt="" />
                Overlays
              </div>
              <div className="mc-overlay-grid">
                <button
                  className={`mc-row mc-overlay-btn${fovVisible ? ' active' : ''}`}
                  onClick={() => setFovVisible((v) => !v)}
                  title={
                    !hasGeoPhotos
                      ? 'Upload geotagged photos to enable FOV cones'
                      : 'Toggle FOV cones'
                  }
                  disabled={!hasGeoPhotos}
                >
                  FOV Cones
                </button>
                <button
                  className={`mc-row mc-overlay-btn${heatmapActive ? ' active' : ''}`}
                  onClick={() => setHeatmapActive(!heatmapActive)}
                  disabled={!hasGeoPhotos}
                  title={!hasGeoPhotos ? 'Upload geotagged photos to enable heatmap' : undefined}
                >
                  Heatmap
                </button>
              </div>
              <button
                className={`mc-row${showRoute ? ' active' : ''}`}
                onClick={() => setShowRoute((r) => !r)}
                disabled={!hasGeoPhotos}
                title={!hasGeoPhotos ? 'Upload geotagged photos to enable route' : undefined}
              >
                Route
              </button>
            </div>
            <div className="mc-panel">
              <div className="mc-section-label">
                <img src={drawIconUrl} className="mc-layer-header-icon" alt="" />
                Filters
              </div>
              <button
                className={`mc-row${drawMode || hasRegion ? ' active' : ''}`}
                onClick={() => {
                  if (hasRegion) {
                    clearRegion();
                    return;
                  }
                  setDrawMode((d) => !d);
                }}
                title={
                  drawMode
                    ? 'Click map to add vertices, double-click to finish'
                    : hasRegion
                      ? 'Clear region filter'
                      : 'Draw region filter'
                }
              >
                {drawMode ? '✕ Cancel Draw' : hasRegion ? '✕ Clear Region' : 'Draw Region'}
              </button>
              {drawMode && (
                <div className="mc-hint">Click to add points · Double-click to finish</div>
              )}
            </div>
          </div>,
          heatControlEl
        )}
      {legendEl &&
        heatmapActive &&
        createPortal(
          <div className="map-legend">
            <div className="map-legend-bar" />
            <div className="map-legend-labels">
              <span>sparse</span>
              <span>dense</span>
            </div>
          </div>,
          legendEl
        )}
      {exportEl &&
        createPortal(
          <div className="mc-panel map-export-panel">
            <div className="mc-section-label">
              <img src={exportIconUrl} className="mc-layer-header-icon" alt="" />
              Save map
            </div>
            <div className="mc-overlay-grid">
              <button
                className="mc-row mc-overlay-btn"
                onClick={() => void handleExport()}
                title="Save map as PNG"
              >
                PNG
              </button>
              <button
                className="mc-row mc-overlay-btn"
                onClick={() => exportPhotos('kml')}
                disabled={!hasGps}
                title="Export geotagged photos as KML"
              >
                KML
              </button>
            </div>
          </div>,
          exportEl
        )}
    </>
  );
});
