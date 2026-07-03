// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { LocationSearch } from '../../src/components/LocationSearch.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function search(value) {
  fireEvent.change(screen.getByLabelText('Search for a location'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /search location/i }));
}

describe('LocationSearch', () => {
  // FE-05: the component now calls the server proxy /api/geocode/search, which
  // returns { lat:number, lon:number, displayName:string }.
  it('queries the server proxy and flies to the single matching result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [{ lat: 51.5, lon: -0.12, displayName: 'London, UK' }] });
    vi.stubGlobal('fetch', fetchMock);
    const onFlyTo = vi.fn();
    render(<LocationSearch onFlyTo={onFlyTo} />);
    search('London');
    await waitFor(() => expect(onFlyTo).toHaveBeenCalledWith(51.5, -0.12, 12));
    expect(fetchMock.mock.calls[0][0]).toContain('/api/geocode/search');
    expect(fetchMock.mock.calls[0][0]).not.toContain('nominatim');
  });

  it('lists multiple results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { lat: 1, lon: 1, displayName: 'Alpha, X' },
          { lat: 2, lon: 2, displayName: 'Beta, Y' },
        ],
      })
    );
    render(<LocationSearch onFlyTo={vi.fn()} />);
    search('Multi');
    expect(await screen.findByText('Alpha, X')).toBeInTheDocument();
    expect(screen.getByText('Beta, Y')).toBeInTheDocument();
  });

  it('shows an error when there are no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<LocationSearch onFlyTo={vi.fn()} />);
    search('Nowhere');
    expect(await screen.findByText(/No locations found/i)).toBeInTheDocument();
  });

  it('shows an error when the proxy request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }));
    render(<LocationSearch onFlyTo={vi.fn()} />);
    search('Boom');
    expect(await screen.findByText(/Location search failed/i)).toBeInTheDocument();
  });
});
