import { useEffect, useRef } from 'react';
import type { SharedPhoto } from '../../shared/api.ts';
import { useShare } from '../hooks/useShare.ts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
// The plugin attaches L.MarkerClusterGroup to Leaflet (its types describe it there).
import 'leaflet.markercluster';

// FEAT: public, read-only shared project map. Rendered instead of <App> when the
// URL is /share/:token (see main.tsx). It talks only to the public endpoint, has
// no upload/edit/delete surface, and never loads the authoring UI or its hooks.

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function photoIcon(photo: SharedPhoto): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="photo-pin"><div class="pin-thumbnail"><img src="/uploads/${esc(
      photo.thumbnailFilename ?? photo.filename
    )}" alt="" loading="lazy" /></div></div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -32],
  });
}

function popupHtml(photo: SharedPhoto): string {
  const date = photo.dateTaken ? new Date(photo.dateTaken).toLocaleDateString() : '';
  const rows = [
    photo.locationName && `<div class="share-popup-loc">${esc(photo.locationName)}</div>`,
    date && `<div class="share-popup-date">${esc(date)}</div>`,
    photo.description && `<div class="share-popup-desc">${esc(photo.description)}</div>`,
  ]
    .filter(Boolean)
    .join('');
  return `<div class="share-popup">
    <a href="/uploads/${esc(photo.filename)}" target="_blank" rel="noopener">
      <img class="share-popup-img" src="/uploads/${esc(
        photo.thumbnailFilename ?? photo.filename
      )}" alt="${esc(photo.originalName)}" />
    </a>
    <div class="share-popup-name">${esc(photo.originalName)}</div>
    ${rows}
  </div>`;
}

export function ShareApp({ token }: { token: string }) {
  const state = useShare(token);
  const share = state.status === 'ok' ? state.share : null;
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Build the map once data has loaded.
  useEffect(() => {
    if (!share || !mapElRef.current || mapRef.current) return;

    const map = L.map(mapElRef.current, { center: [54.5, -3], zoom: 5 });
    mapRef.current = map;

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
      }
    ).addTo(map);

    const geo = share.photos.flatMap((p) =>
      p.hasGps && p.lat != null && p.lng != null ? [{ photo: p, at: L.latLng(p.lat, p.lng) }] : []
    );
    if (geo.length) {
      const cluster = new L.MarkerClusterGroup({
        maxClusterRadius: 80,
        showCoverageOnHover: false,
      });
      for (const { photo, at } of geo) {
        L.marker(at, { icon: photoIcon(photo) })
          .bindPopup(popupHtml(photo), { maxWidth: 260 })
          .addTo(cluster);
      }
      map.addLayer(cluster);
      map.fitBounds(L.latLngBounds(geo.map((g) => g.at)), {
        padding: [50, 50],
        maxZoom: 15,
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [share]);

  if (state.status === 'loading') {
    return <div className="share-message">Loading shared map…</div>;
  }
  if (state.status === 'notfound') {
    return (
      <div className="share-message">
        <h1>Link not available</h1>
        <p>This share link is invalid or has been turned off by its owner.</p>
      </div>
    );
  }
  if (state.status === 'error' || !share) {
    return (
      <div className="share-message">
        <h1>Something went wrong</h1>
        <p>Couldn’t load this shared map. Please try again later.</p>
      </div>
    );
  }

  const geoCount = share.photos.filter((p) => p.hasGps).length;

  return (
    <div className="share-view">
      <header className="share-header">
        <div className="share-header-title">
          <span className="share-header-dot" style={{ background: share.project.color }} />
          <h1>{share.project.name}</h1>
        </div>
        <div className="share-header-meta">
          {geoCount} {geoCount === 1 ? 'photo' : 'photos'} on the map · read-only
        </div>
      </header>
      <div ref={mapElRef} className="share-map" />
      {geoCount === 0 && (
        <div className="share-empty-note">No mapped photos in this project yet.</div>
      )}
    </div>
  );
}
