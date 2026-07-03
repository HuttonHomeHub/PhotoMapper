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
  it('flies to the single matching result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => [{ lat: '51.5', lon: '-0.12' }] })
    );
    const onFlyTo = vi.fn();
    render(<LocationSearch onFlyTo={onFlyTo} />);
    search('London');
    await waitFor(() => expect(onFlyTo).toHaveBeenCalledWith(51.5, -0.12, 12));
  });

  it('lists multiple results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => [
          { lat: '1', lon: '1', display_name: 'Alpha, X' },
          { lat: '2', lon: '2', display_name: 'Beta, Y' },
        ],
      })
    );
    render(<LocationSearch onFlyTo={vi.fn()} />);
    search('Multi');
    expect(await screen.findByText('Alpha, X')).toBeInTheDocument();
    expect(screen.getByText('Beta, Y')).toBeInTheDocument();
  });

  it('shows an error when there are no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [] }));
    render(<LocationSearch onFlyTo={vi.fn()} />);
    search('Nowhere');
    expect(await screen.findByText(/No locations found/i)).toBeInTheDocument();
  });
});
