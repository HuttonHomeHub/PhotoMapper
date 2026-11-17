// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ShareApp } from '../../src/components/ShareApp.tsx';
import { stubFetch } from '../fetchStub.ts';
import { photo } from '../factories.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mapped = (id: string, lat: number, lng: number) =>
  photo({ id, originalName: `${id}.jpg`, hasGps: true, lat, lng, description: 'A <b>note</b>' });

describe('ShareApp', () => {
  it('shows the shared project and its photo count, on a map', async () => {
    stubFetch(() => ({
      body: {
        project: { name: 'Embankment survey', color: '#e97b25' },
        photos: [mapped('a', 53.36, -1.81), mapped('b', 53.37, -1.8), photo({ id: 'c' })],
      },
    }));
    const { container } = render(<ShareApp token="tok-1" />);
    expect(screen.getByText('Loading shared map…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Embankment survey' })).toBeInTheDocument();
    expect(screen.getByText('2 photos on the map · read-only')).toBeInTheDocument();
    // Leaflet attaches to the map element once the share has loaded.
    await waitFor(() =>
      expect(container.querySelector('.share-map.leaflet-container')).not.toBeNull()
    );
    // jsdom gives the map no size, so the cluster layer draws no markers here; the
    // share end-to-end test (e2e/projects.spec.ts) checks the pins in a real browser.
  });

  it('says so when a shared project has no mapped photos', async () => {
    stubFetch(() => ({
      body: { project: { name: 'Empty', color: '#3a86ff' }, photos: [photo({ id: 'x' })] },
    }));
    render(<ShareApp token="tok-2" />);
    expect(await screen.findByText('No mapped photos in this project yet.')).toBeInTheDocument();
    expect(screen.getByText('0 photos on the map · read-only')).toBeInTheDocument();
  });

  it('tells a turned-off link from a failure', async () => {
    stubFetch(() => ({ status: 404, body: { error: 'Share not found' } }));
    render(<ShareApp token="gone" />);
    expect(await screen.findByRole('heading', { name: 'Link not available' })).toBeInTheDocument();
    cleanup();
    stubFetch(() => ({ status: 500, body: { error: 'boom' } }));
    render(<ShareApp token="broken" />);
    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' })
    ).toBeInTheDocument();
  });
});
