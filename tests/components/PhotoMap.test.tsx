// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createRef } from 'react';
import {
  PhotoMap,
  type PhotoMapHandle,
  type PhotoMapProps,
} from '../../src/components/PhotoMap.tsx';
import type { Photo } from '../../shared/api.ts';
import { photo, must } from '../factories.ts';

// heatmap.js draws on a <canvas>, which jsdom lacks: stand in a plain Leaflet layer
// that records the data it is given.
const heat = vi.hoisted(() => ({ setData: vi.fn() }));
vi.mock('leaflet-heatmap', async () => {
  const { default: Leaflet } = await import('leaflet');
  class HeatmapOverlay extends Leaflet.Layer {
    setData(data: unknown): void {
      heat.setData(data);
    }
    override onAdd(): this {
      this.getPane()?.classList.add('test-heatmap-on');
      return this;
    }
    override onRemove(): this {
      this.getPane()?.classList.remove('test-heatmap-on');
      return this;
    }
  }
  return { default: HeatmapOverlay };
});

const html2canvas = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ toDataURL: () => 'data:image/png;base64,x' }))
);
vi.mock('html2canvas', () => ({ default: html2canvas }));

// Leaflet sizes the map from the container's client size, which jsdom reports as 0.
// A real size lets markercluster place pins inside the visible bounds.
const sizeProps = ['clientWidth', 'clientHeight'] as const;
beforeAll(() => {
  for (const prop of sizeProps) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get: () => (prop === 'clientWidth' ? 800 : 600),
    });
  }
});
afterAll(() => {
  for (const prop of sizeProps) {
    Reflect.deleteProperty(HTMLElement.prototype, prop);
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  heat.setData.mockClear();
  html2canvas.mockClear();
});

const london = photo({
  id: 'a',
  filename: 'a.jpg',
  thumbnailFilename: 'thumb_a.jpg',
  hasGps: true,
  lat: 51.5,
  lng: -0.12,
  dateTaken: '2021-06-02T10:00:00.000Z',
  originalName: 'A.jpg',
});
const paris = photo({
  id: 'b',
  filename: 'b.jpg',
  thumbnailFilename: 'thumb_b.jpg',
  hasGps: true,
  lat: 48.85,
  lng: 2.35,
  dateTaken: '2021-06-01T10:00:00.000Z',
  imgDirection: 90,
  originalName: 'B.jpg',
});
const unmapped = photo({ id: 'c', filename: 'c.jpg' });

function props(overrides: Partial<PhotoMapProps> = {}): PhotoMapProps {
  return {
    photos: [],
    onDelete: vi.fn(() => Promise.resolve()),
    onView: vi.fn(),
    hoveredPhotoId: null,
    onPhotoHover: vi.fn(),
    onRegionChange: vi.fn(),
    onBoundsChange: vi.fn(),
    exportPhotos: vi.fn(),
    hasGps: true,
    placingPhoto: null,
    onPlacePhoto: vi.fn(),
    onRepositionPhoto: vi.fn(),
    ...overrides,
  };
}

function pins(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.leaflet-marker-pane .photo-pin')];
}

function pinFor(p: Photo): HTMLElement {
  const img = must(
    document.querySelector<HTMLElement>(
      `.leaflet-marker-pane img[src="/uploads/${p.thumbnailFilename ?? p.filename}"]`
    ),
    `pin for ${p.id}`
  );
  return must(img.closest<HTMLElement>('.leaflet-marker-icon'), 'marker icon');
}

function mapContainer(): HTMLElement {
  return must(document.querySelector<HTMLElement>('.leaflet-container'), 'map container');
}

/** Leaflet turns DOM clicks on the container into map 'click' events at that point. */
function clickMap(x: number, y: number) {
  fireEvent.click(mapContainer(), { clientX: x, clientY: y });
}

describe('PhotoMap markers', () => {
  it('renders a pin per mapped photo, with a direction arrow and a manual badge', () => {
    const manual = photo({
      id: 'm',
      filename: 'm.jpg',
      thumbnailFilename: null,
      hasGps: true,
      manualGps: true,
      lat: 50,
      lng: 0,
    });
    render(<PhotoMap {...props({ photos: [london, paris, unmapped, manual] })} />);
    expect(pins()).toHaveLength(3);
    expect(pinFor(paris).querySelector('.pin-arrow')).toHaveStyle({ transform: 'rotate(90deg)' });
    expect(pinFor(london).querySelector('.pin-arrow')).toBeNull();
    expect(pinFor(manual).querySelector('.photo-pin')).toHaveClass('photo-pin--manual');
    expect(pinFor(manual).querySelector('.pin-manual-badge')).toBeInTheDocument();
    expect(pinFor(london).querySelector('.photo-pin')).not.toHaveClass('photo-pin--manual');
  });

  it('syncs markers incrementally: edits keep the marker, moves rebuild it, removals drop it', () => {
    const p = props({ photos: [london, paris] });
    const { rerender } = render(<PhotoMap {...p} />);
    const londonPin = pinFor(london);
    const parisPin = pinFor(paris);

    rerender(<PhotoMap {...p} photos={[{ ...london, description: 'edited' }, paris]} />);
    expect(pinFor(london)).toBe(londonPin);

    rerender(
      <PhotoMap
        {...p}
        photos={[
          { ...london, description: 'edited' },
          { ...paris, lat: 48.9 },
        ]}
      />
    );
    expect(pinFor(london)).toBe(londonPin);
    expect(pinFor(paris)).not.toBe(parisPin);
    expect(parisPin).not.toBeInTheDocument();

    rerender(<PhotoMap {...p} photos={[paris]} />);
    expect(londonPin).not.toBeInTheDocument();
    expect(pins()).toHaveLength(1);
  });

  it('fits the view to the first mapped photos and resets only when the last one goes', () => {
    const onBoundsChange = vi.fn();
    const ref = createRef<PhotoMapHandle>();
    const p = props({ onBoundsChange });
    const { rerender } = render(<PhotoMap ref={ref} {...p} />);
    const initial = must(ref.current, 'handle').getBounds();
    expect(initial?.contains([54.5, -3])).toBe(true);

    rerender(<PhotoMap ref={ref} {...p} photos={[london, paris]} />);
    const fitted = must(must(ref.current, 'handle').getBounds(), 'bounds');
    expect(fitted.contains([london.lat ?? 0, london.lng ?? 0])).toBe(true);
    expect(fitted.contains([paris.lat ?? 0, paris.lng ?? 0])).toBe(true);
    expect(fitted.contains([54.5, -3])).toBe(false);
    expect(onBoundsChange).toHaveBeenCalled();
    const last = onBoundsChange.mock.lastCall?.[0] as { north: number; south: number };
    expect(last.north).toBeGreaterThan(51.5);
    expect(last.south).toBeLessThan(48.85);

    rerender(<PhotoMap ref={ref} {...p} photos={[unmapped]} />);
    expect(must(ref.current, 'handle').getBounds()?.contains([54.5, -3])).toBe(true);
  });

  it('does not keep resetting an empty map on every render', () => {
    const onBoundsChange = vi.fn();
    const p = props({ onBoundsChange, photos: [unmapped] });
    const { rerender } = render(<PhotoMap {...p} />);
    const calls = onBoundsChange.mock.calls.length;
    for (let i = 0; i < 5; i++) {
      rerender(<PhotoMap {...p} photos={[{ ...unmapped, description: `edit ${i}` }]} />);
    }
    expect(onBoundsChange.mock.calls.length).toBe(calls);
  });

  it('highlights the hovered photo and reports hover from the pins', () => {
    const onPhotoHover = vi.fn();
    const p = props({ photos: [london, paris], onPhotoHover });
    const { rerender } = render(<PhotoMap {...p} />);
    rerender(<PhotoMap {...p} hoveredPhotoId="b" />);
    expect(pinFor(paris)).toHaveClass('pin-highlighted');
    expect(pinFor(london)).not.toHaveClass('pin-highlighted');
    rerender(<PhotoMap {...p} hoveredPhotoId={null} />);
    expect(pinFor(paris)).not.toHaveClass('pin-highlighted');

    fireEvent.mouseOver(pinFor(london));
    expect(onPhotoHover).toHaveBeenLastCalledWith('a');
    fireEvent.mouseOut(pinFor(london));
    expect(onPhotoHover).toHaveBeenLastCalledWith(null);
  });

  it('opens a popup with the latest photo data and wires its actions', async () => {
    const onView = vi.fn();
    const onDelete = vi.fn(() => Promise.resolve());
    const p = props({ photos: [london, paris], onView, onDelete });
    const { rerender } = render(<PhotoMap {...p} />);
    const renamed = { ...london, cameraMake: 'Canon' };
    rerender(<PhotoMap {...p} photos={[renamed, paris]} />);

    fireEvent.click(pinFor(london));
    const view = await screen.findByRole('button', { name: 'View photo' });
    expect(screen.getByText('A.jpg')).toBeInTheDocument();
    expect(screen.getByText('Canon')).toBeInTheDocument();
    fireEvent.click(view);
    expect(onView).toHaveBeenCalledWith(renamed);

    fireEvent.click(screen.getByRole('button', { name: 'Delete photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(onDelete).toHaveBeenCalledWith('a');
    // Deleting closes the popup, whose React root is unmounted after the Leaflet event.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'View photo' })).toBeNull());
  });

  it('reports a dragged manual pin through onRepositionPhoto', async () => {
    const onRepositionPhoto = vi.fn();
    const manual = photo({ id: 'm', hasGps: true, manualGps: true, lat: 51.5, lng: -0.12 });
    render(<PhotoMap {...props({ photos: [manual], onRepositionPhoto })} />);
    const pin = pinFor(manual);
    fireEvent.mouseDown(pin, { button: 0, which: 1, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document.body, { clientX: 140, clientY: 130 });
    await new Promise((r) => setTimeout(r, 30));
    fireEvent.mouseUp(document.body, { clientX: 140, clientY: 130 });
    await waitFor(() => expect(onRepositionPhoto).toHaveBeenCalled());
    const [id, lat, lng] = onRepositionPhoto.mock.calls[0] as [string, number, number];
    expect(id).toBe('m');
    expect(lat).not.toBe(51.5);
    expect(lng).not.toBe(-0.12);
  });

  it('clusters nearby pins and handles cluster clicks', () => {
    const twin = { ...london, id: 'a2', filename: 'a2.jpg', thumbnailFilename: 'thumb_a2.jpg' };
    const near = {
      ...london,
      id: 'a3',
      filename: 'a3.jpg',
      thumbnailFilename: 'thumb_a3.jpg',
      lat: 51.5004,
      lng: -0.1204,
    };
    const ref = createRef<PhotoMapHandle>();
    render(<PhotoMap ref={ref} {...props({ photos: [london, twin, near, paris] })} />);
    const cluster = must(document.querySelector<HTMLElement>('.cluster-icon'), 'cluster');
    expect(cluster).toHaveClass('cluster-xs');
    expect(cluster).toHaveTextContent('3');
    // Not a single point and not at max zoom: the click zooms in on the cluster.
    const before = must(must(ref.current, 'handle').getBounds(), 'bounds');
    fireEvent.click(must(cluster.closest<HTMLElement>('.leaflet-marker-icon'), 'cluster marker'));
    const after = must(must(ref.current, 'handle').getBounds(), 'bounds');
    expect(before.contains(after)).toBe(true);
    expect(after.contains(before)).toBe(false);
  });

  it('spiderfies a cluster of photos at the same point', async () => {
    const twin = { ...london, id: 'a2', filename: 'a2.jpg', thumbnailFilename: 'thumb_a2.jpg' };
    render(<PhotoMap {...props({ photos: [london, twin] })} />);
    expect(pins()).toHaveLength(0);
    // markercluster ignores clicks until its zoom animation has finished.
    await new Promise((r) => setTimeout(r, 300));
    // The zoom animation can leave a faded-out copy of the cluster icon behind.
    const cluster = must(
      [...document.querySelectorAll<HTMLElement>('.leaflet-marker-icon')].find(
        (el) => el.style.opacity !== '0' && el.querySelector('.cluster-icon') !== null
      ),
      'visible cluster'
    );
    expect(cluster).toHaveTextContent('2');
    fireEvent.click(cluster);
    // Spiderfying fans the pins out with an animation.
    await waitFor(() => expect(pins()).toHaveLength(2));
  });
});

describe('PhotoMap handle', () => {
  it('flies to a point and fits to photos, ignoring unmapped ones', () => {
    const ref = createRef<PhotoMapHandle>();
    render(<PhotoMap ref={ref} {...props()} />);
    const handle = must(ref.current, 'handle');
    handle.flyTo(40.7, -74, 12);
    expect(handle.getBounds()?.contains([40.7, -74])).toBe(true);
    expect(handle.getBounds()?.contains([51.5, -0.12])).toBe(false);

    const before = handle.getBounds();
    handle.fitToBounds([]);
    handle.fitToBounds([unmapped]);
    expect(handle.getBounds()?.equals(must(before, 'bounds'))).toBe(true);

    handle.fitToBounds([london, paris]);
    expect(handle.getBounds()?.contains([48.85, 2.35])).toBe(true);
    expect(handle.getBounds()?.contains([51.5, -0.12])).toBe(true);
  });
});

describe('PhotoMap controls', () => {
  it('switches the map style from the picker and cancels on mouse leave', () => {
    // fireEvent rather than user-event here, for two jsdom artefacts: user-event moves
    // between elements with a mouseout whose relatedTarget is null, which React reads as
    // leaving the panel (cancelling the menu); and its quick clicks (detail 1, not
    // pointer events) trip Leaflet's touch double-tap emulation on the map.
    render(<PhotoMap {...props()} />);
    const tiles = () =>
      [...document.querySelectorAll('.leaflet-tile-pane img')].map(
        (i) => i.getAttribute('src') ?? ''
      );
    expect(tiles().some((s) => s.includes('arcgisonline'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Satellite/ }));
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Satellite' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Streets' }));
    expect(screen.getByRole('button', { name: /Streets/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dark' })).toBeNull();
    expect(tiles().some((s) => s.includes('openstreetmap'))).toBe(true);
    expect(tiles().some((s) => s.includes('arcgisonline'))).toBe(false);

    // Opening then leaving the panel closes the menu and keeps the style.
    fireEvent.click(screen.getByRole('button', { name: /Streets/ }));
    expect(screen.getByRole('button', { name: 'Terrain' })).toBeInTheDocument();
    fireEvent.mouseLeave(must(screen.getByText('Map style').closest('.mc-panel'), 'panel'));
    expect(screen.queryByRole('button', { name: 'Terrain' })).toBeNull();
    expect(screen.getByRole('button', { name: /Streets/ })).toBeInTheDocument();

    // The picker button toggles the menu closed too.
    fireEvent.click(screen.getByRole('button', { name: /Streets/ }));
    fireEvent.click(screen.getByRole('button', { name: /Streets/ }));
    expect(screen.queryByRole('button', { name: 'Terrain' })).toBeNull();
  });

  it('disables the overlays without mapped photos', () => {
    render(<PhotoMap {...props({ photos: [unmapped], hasGps: false })} />);
    expect(screen.getByRole('button', { name: 'FOV Cones' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Heatmap' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Route' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'KML' })).toBeDisabled();
  });

  it('toggles FOV cones for photos with a bearing', async () => {
    const user = userEvent.setup();
    const pano = photo({
      id: 'pano',
      filename: 'pano.jpg',
      hasGps: true,
      lat: 50,
      lng: 1,
      imgDirection: 0,
      panoHFov: 360,
    });
    const wide = photo({
      id: 'wide',
      filename: 'wide.jpg',
      hasGps: true,
      lat: 49,
      lng: 1,
      imgDirection: 45,
      panoHFov: 120,
    });
    const tele = photo({
      id: 'tele',
      filename: 'tele.jpg',
      hasGps: true,
      lat: 49,
      lng: -1,
      imgDirection: 180,
      focalLength: 200,
    });
    const p = props({ photos: [london, paris, pano, wide, tele] });
    const { rerender } = render(<PhotoMap {...p} />);
    const cones = () => document.querySelectorAll('.leaflet-overlay-pane path');
    expect(cones()).toHaveLength(0);

    const button = screen.getByRole('button', { name: 'FOV Cones' });
    await user.click(button);
    expect(button).toHaveClass('active');
    expect(cones()).toHaveLength(4); // paris, pano (a ring), wide, tele; london has no bearing

    // New photos get their cone straight away while cones are shown; removed ones lose it.
    const added = photo({
      id: 'new',
      filename: 'new.jpg',
      hasGps: true,
      lat: 50,
      lng: -1,
      imgDirection: 10,
    });
    rerender(<PhotoMap {...p} photos={[london, paris, pano, wide, tele, added]} />);
    expect(cones()).toHaveLength(5);
    rerender(<PhotoMap {...p} photos={[london, paris]} />);
    expect(cones()).toHaveLength(1);

    await user.click(button);
    expect(cones()).toHaveLength(0);
  });

  it('swaps pins for a heatmap and shows its legend', async () => {
    const user = userEvent.setup();
    const p = props({ photos: [london, paris] });
    const { rerender } = render(<PhotoMap {...p} />);
    expect(heat.setData).toHaveBeenLastCalledWith({
      max: 1,
      data: [
        { lat: 51.5, lng: -0.12, value: 0.35 },
        { lat: 48.85, lng: 2.35, value: 0.35 },
      ],
    });
    expect(screen.queryByText('sparse')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Heatmap' }));
    expect(pins()).toHaveLength(0);
    expect(screen.getByText('sparse')).toBeInTheDocument();
    expect(screen.getByText('dense')).toBeInTheDocument();
    expect(document.querySelector('.test-heatmap-on')).toBeInTheDocument();

    // With no mapped photos left, the heatmap switches itself off.
    rerender(<PhotoMap {...p} photos={[unmapped]} />);
    expect(heat.setData).toHaveBeenLastCalledWith({ max: 1, data: [] });
    expect(screen.queryByText('sparse')).toBeNull();
    expect(document.querySelector('.test-heatmap-on')).toBeNull();

    rerender(<PhotoMap {...p} />);
    expect(screen.getByText('sparse')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Heatmap' }));
    expect(screen.queryByText('sparse')).toBeNull();
    expect(pins()).toHaveLength(2);
  });

  it('draws the trip route through two or more photos', async () => {
    const user = userEvent.setup();
    const undated = photo({
      id: 'u',
      filename: 'u.jpg',
      hasGps: true,
      lat: 50,
      lng: 0,
      uploadedAt: '',
    });
    const p = props({ photos: [paris] });
    const { rerender } = render(<PhotoMap {...p} />);
    const lines = () => document.querySelectorAll('.leaflet-overlay-pane path');

    await user.click(screen.getByRole('button', { name: 'Route' }));
    expect(screen.getByRole('button', { name: 'Route' })).toHaveClass('active');
    expect(lines()).toHaveLength(0); // one photo is not a route

    rerender(<PhotoMap {...p} photos={[london, paris, undated]} />);
    expect(lines()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Route' }));
    expect(lines()).toHaveLength(0);
  });

  it('draws a region filter and clears it', async () => {
    const user = userEvent.setup();
    const onRegionChange = vi.fn();
    render(<PhotoMap {...props({ onRegionChange })} />);
    await user.click(screen.getByRole('button', { name: 'Draw Region' }));
    expect(screen.getByText(/Double-click to finish/)).toBeInTheDocument();
    expect(mapContainer().style.cursor).toBe('crosshair');

    clickMap(100, 100);
    clickMap(300, 100);
    expect(document.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(1); // preview
    clickMap(300, 300);
    // A double-click is preceded by a click at the same spot, which is dropped.
    clickMap(300, 300);
    fireEvent.dblClick(mapContainer(), { clientX: 300, clientY: 300 });

    expect(onRegionChange).toHaveBeenCalledTimes(1);
    const points = onRegionChange.mock.calls[0]?.[0] as Array<{ lat: number; lng: number }>;
    expect(points).toHaveLength(3);
    expect(points[0]?.lat).toBeGreaterThan(must(points[2], 'third point').lat);
    expect(points[1]?.lng).toBeGreaterThan(must(points[0], 'first point').lng);
    expect(document.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(1); // final region
    expect(mapContainer().style.cursor).toBe('');

    // Draw mode is over: further clicks add nothing.
    clickMap(50, 50);
    expect(onRegionChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '✕ Clear Region' }));
    expect(onRegionChange).toHaveBeenLastCalledWith(null);
    expect(document.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Draw Region' })).toBeInTheDocument();
  });

  it('ignores a double-click with too few points and cleans up a cancelled draw', async () => {
    const user = userEvent.setup();
    const onRegionChange = vi.fn();
    render(<PhotoMap {...props({ onRegionChange })} />);
    await user.click(screen.getByRole('button', { name: 'Draw Region' }));
    clickMap(100, 100);
    clickMap(300, 100);
    fireEvent.dblClick(mapContainer(), { clientX: 300, clientY: 100 });
    expect(onRegionChange).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '✕ Cancel Draw' }));
    expect(document.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0);
    expect(onRegionChange).not.toHaveBeenCalled();
  });

  it('places a photo where the map is clicked while placing', () => {
    const onPlacePhoto = vi.fn();
    const p = props({ onPlacePhoto });
    const { rerender } = render(<PhotoMap {...p} />);
    clickMap(400, 300);
    expect(onPlacePhoto).not.toHaveBeenCalled();

    rerender(<PhotoMap {...p} placingPhoto={unmapped} />);
    expect(mapContainer().style.cursor).toBe('crosshair');
    clickMap(400, 300);
    expect(onPlacePhoto).toHaveBeenCalledTimes(1);
    const [lat, lng] = onPlacePhoto.mock.calls[0] as [number, number];
    expect(lat).toBeCloseTo(54.5, 0);
    expect(lng).toBeCloseTo(-3, 0);

    rerender(<PhotoMap {...p} placingPhoto={null} />);
    expect(mapContainer().style.cursor).toBe('');
    clickMap(400, 300);
    expect(onPlacePhoto).toHaveBeenCalledTimes(1);
  });

  it('exports KML and a PNG of the map', async () => {
    const user = userEvent.setup();
    const exportPhotos = vi.fn();
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<PhotoMap {...props({ exportPhotos })} />);
    await user.click(screen.getByRole('button', { name: 'KML' }));
    expect(exportPhotos).toHaveBeenCalledWith('kml');

    await user.click(screen.getByRole('button', { name: 'PNG' }));
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    expect(html2canvas).toHaveBeenCalledWith(
      mapContainer(),
      expect.objectContaining({ useCORS: true })
    );
    const link = clicked.mock.contexts[0];
    if (!(link instanceof HTMLAnchorElement)) throw new Error('expected a clicked link');
    expect(link.download).toBe('map.png');
    expect(link.href).toBe('data:image/png;base64,x');
  });

  it('removes the map on unmount', () => {
    const { unmount } = render(<PhotoMap {...props({ photos: [london] })} />);
    unmount();
    expect(document.querySelector('.leaflet-container')).toBeNull();
  });
});
