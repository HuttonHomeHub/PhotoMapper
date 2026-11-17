// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { App } from '../../src/App.tsx';
import { ToastProvider } from '../../src/components/Toast.tsx';
import { isGet, stubFetch, type Route } from '../fetchStub.ts';
import { client, photo, project } from '../factories.ts';

// The heatmap layer draws on a canvas, which jsdom lacks; the map itself is real Leaflet.
vi.mock('leaflet-heatmap', async () => {
  const L = (await import('leaflet')).default;
  return {
    default: class extends L.Layer {
      setData() {}
    },
  };
});

beforeAll(() => {
  // jsdom has no native <dialog> methods (the Settings panel uses one).
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  Element.prototype.scrollIntoView ??= () => {};
  // jsdom lays nothing out; give elements a screen-like size so the map has a real
  // view (the sidebar list is filtered to what the map shows).
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1024 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 768 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const library = [
  photo({
    id: 'a',
    originalName: 'a.jpg',
    hasGps: true,
    lat: 53.36,
    lng: -1.81,
    altitude: 300,
    dateTaken: '2026-01-02T10:00:00Z',
    surveyDate: '2026-01-02',
    tags: ['drainage'],
    projectId: 'p1',
  }),
  photo({
    id: 'b',
    originalName: 'b.jpg',
    hasGps: true,
    lat: 53.37,
    lng: -1.8,
    altitude: 340,
    dateTaken: '2026-01-05T10:00:00Z',
    surveyDate: '2026-01-05',
  }),
  photo({ id: 'c', originalName: 'c.jpg' }),
];

function server(overrides: Partial<Record<string, Route>> = {}) {
  return stubFetch((url, init) => {
    const custom = overrides[`${init.method ?? 'GET'} ${url}`];
    if (custom) return custom(url, init);
    if (url === '/version') return { body: { version: '1.3.0' } };
    if (url === '/api/photos' && isGet(init)) return { body: library };
    if (url === '/api/projects' && isGet(init))
      return { body: [project({ id: 'p1', name: 'Survey', clientId: 'c1', photoCount: 1 })] };
    if (url === '/api/clients' && isGet(init))
      return { body: [client({ id: 'c1', name: 'Acme', projectCount: 1 })] };
    if (url === '/api/reset') return { body: { ok: true } };
    if (url === '/api/backup')
      return {
        body: {
          enabled: true,
          dir: '/b',
          intervalHours: 24,
          keep: 7,
          includeUploads: true,
          backups: [],
          scheduler: { enabled: true, intervalHours: 24 },
        },
      };
    return { body: {} };
  });
}

async function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>
  );
  await screen.findByRole('button', { name: 'a.jpg, on map' });
}

describe('App', () => {
  it('loads the library: photos, the client tree and the running version', async () => {
    server();
    await renderApp();
    expect(screen.getByRole('button', { name: 'c.jpg, no GPS' })).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(await screen.findByText('1.3.0')).toBeInTheDocument();
  });

  it('shows the drop zone for an empty library, and a banner when loading fails', async () => {
    server({ 'GET /api/photos': () => ({ body: [] }) });
    render(
      <ToastProvider>
        <App />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Drop photos here')).toBeInTheDocument());
    cleanup();
    server({ 'GET /api/photos': () => ({ status: 500, body: { error: 'down' } }) });
    render(
      <ToastProvider>
        <App />
      </ToastProvider>
    );
    await waitFor(() =>
      expect(screen.getByText('Failed to load photos. Please refresh.')).toBeInTheDocument()
    );
  });

  it('filters by tag from a photo, and clears the filter from its chip', async () => {
    server();
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by tag: drainage' }));
    const chip = await screen.findByRole('button', { name: '#drainage ×' });
    expect(screen.queryByRole('button', { name: 'b.jpg, on map' })).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(await screen.findByRole('button', { name: 'b.jpg, on map' })).toBeInTheDocument();
  });

  it('filters by client from the tree, and "Clear all" resets every filter', async () => {
    server();
    await renderApp();
    fireEvent.click(screen.getByText('Acme'));
    expect(await screen.findByRole('button', { name: 'Acme ×' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'b.jpg, on map' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Acme ×' })).not.toBeInTheDocument()
    );
    // The map zoomed to the client's photo; the list follows what the map shows.
    expect(screen.getByRole('button', { name: 'a.jpg, on map' })).toBeInTheDocument();
  });

  it('narrows the date range with the slider', async () => {
    server();
    await renderApp();
    const start = screen.getByLabelText('Filter start date');
    fireEvent.change(start, {
      target: { value: String(new Date('2026-01-04T12:00:00Z').getTime()) },
    });
    expect(await screen.findByRole('button', { name: 'Date range ×' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'a.jpg, on map' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Date range ×' }));
    expect(await screen.findByRole('button', { name: 'a.jpg, on map' })).toBeInTheDocument();
  });

  it('opens a photo in the lightbox, and compares two photos', async () => {
    server();
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'View a.jpg' }));
    expect(document.querySelector('.lightbox-overlay')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.lightbox-overlay')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Compare a.jpg' }));
    expect(screen.getByText('Pick a second photo to compare')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare b.jpg' }));
    const overlay = await waitFor(() => {
      const el = document.querySelector('.comparison-overlay');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(within(overlay).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.querySelector('.comparison-overlay')).toBeNull());
  });

  it('enters and leaves placement mode for a photo without GPS', async () => {
    server();
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Place on map/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Click the map to place c.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Place on map/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('shows the elevation profile when two photos have altitude', async () => {
    server();
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '▴ Elevation Profile' }));
    expect(await screen.findByText('↑ 40m gain')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '▾ Hide Elevation' }));
    expect(screen.queryByText('↑ 40m gain')).not.toBeInTheDocument();
  });

  it('plays the timeline, with Space to pause', async () => {
    server();
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Timeline/ }));
    fireEvent.click(screen.getByRole('button', { name: '▶ Play Timeline' }));
    expect(screen.getByLabelText(/Timeline: photo 1 of 3/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause timeline' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Play timeline (Space)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '✕ Exit Timeline' }));
  });

  it('opens the shortcuts with ? and the app bar, and resets all data after confirming', async () => {
    const fetchMock = server();
    await renderApp();
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset all data…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset all data…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, wipe everything' }));
    expect(await screen.findByText('All data cleared')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/reset')).toBe(true);
  });

  it('reports a refused reset', async () => {
    server({
      'DELETE /api/reset': () => ({ status: 403, body: { error: 'Reset is disabled.' } }),
    });
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset all data…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, wipe everything' }));
    expect(await screen.findByText('Reset is disabled.')).toBeInTheDocument();
  });

  it('opens Settings from the app bar', async () => {
    server({
      'GET /api/info': () => ({
        body: {
          version: '1.3.0',
          counts: { photos: 3, projects: 1, clients: 1 },
          paths: { database: '/d', uploads: '/u', backups: '/b' },
          limits: { maxUploadMb: 60, apiRate: { limit: 1000, windowMs: 900000 } },
          trustProxyHops: 0,
        },
      }),
    });
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText('3 photos · 1 projects · 1 clients')).toBeInTheDocument();
  });
});
