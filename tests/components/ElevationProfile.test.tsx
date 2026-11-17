// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ElevationProfile } from '../../src/components/ElevationProfile.tsx';
import { photo as makePhoto, must } from '../factories.ts';

afterEach(cleanup);

// Three points heading north along a meridian, 0.01° (~1.11 km) apart, given out of date order.
const p1 = makePhoto({
  id: 'p1',
  hasGps: true,
  lat: 50,
  lng: 0,
  altitude: 100,
  dateTaken: '2021-01-01T10:00:00Z',
});
const p2 = makePhoto({
  id: 'p2',
  hasGps: true,
  lat: 50.01,
  lng: 0,
  altitude: 250.4,
  dateTaken: '2021-01-01T11:00:00Z',
});
const p3 = makePhoto({
  id: 'p3',
  hasGps: true,
  lat: 50.02,
  lng: 0,
  altitude: 180,
  dateTaken: null,
  uploadedAt: '2021-01-01T12:00:00Z',
});

function circles(container: HTMLElement): SVGCircleElement[] {
  return [...container.querySelectorAll('circle')];
}

describe('ElevationProfile', () => {
  it('renders nothing with fewer than two usable photos', () => {
    const noAlt = makePhoto({ id: 'x', hasGps: true, lat: 1, lng: 1, altitude: null });
    const noGps = makePhoto({ id: 'y', hasGps: false, lat: 1, lng: 1, altitude: 5 });
    const noLat = makePhoto({ id: 'z', hasGps: true, lat: null, lng: 1, altitude: 5 });
    const noLng = makePhoto({ id: 'w', hasGps: true, lat: 1, lng: null, altitude: 5 });
    const { container } = render(
      <ElevationProfile photos={[p1, noAlt, noGps, noLat, noLng]} hoveredPhotoId={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for no photos', () => {
    const { container } = render(<ElevationProfile photos={[]} hoveredPhotoId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows gain, loss, distance and altitude range', () => {
    render(<ElevationProfile photos={[p3, p1, p2]} hoveredPhotoId={null} />);
    expect(screen.getByText('↑ 150m gain')).toBeInTheDocument();
    expect(screen.getByText('↓ 70m loss')).toBeInTheDocument();
    // total distance ~2.22 km appears in the stats and as the x-axis end label
    expect(screen.getAllByText('2.2 km')).toHaveLength(2);
    expect(screen.getByText('100–250m alt')).toBeInTheDocument();
    expect(screen.getByText('0 km')).toBeInTheDocument();
    // y-axis labels: min, middle, max
    expect(screen.getByText('100m')).toBeInTheDocument();
    expect(screen.getByText('175m')).toBeInTheDocument();
    expect(screen.getByText('250m')).toBeInTheDocument();
  });

  it('draws one dot per point in date order, matching the polyline', () => {
    const { container } = render(<ElevationProfile photos={[p3, p1, p2]} hoveredPhotoId={null} />);
    const dots = circles(container);
    expect(dots).toHaveLength(3);
    const xs = dots.map((d) => Number(d.getAttribute('cx')));
    // sorted by date: p1 at the left edge, p3 at the right
    expect(xs[0]).toBe(48);
    expect(must(xs[2], 'last x')).toBeCloseTo(784);
    expect(must(xs[1], 'middle x')).toBeCloseTo(416, 0);
    // p2 is the highest point → top of the chart; p1 the lowest → bottom
    expect(Number(must(dots[1], 'p2 dot').getAttribute('cy'))).toBe(12);
    expect(Number(must(dots[0], 'p1 dot').getAttribute('cy'))).toBe(92);

    const polyline = must(container.querySelector('polyline'), 'polyline');
    const pairs = must(polyline.getAttribute('points'), 'points').split(' ');
    expect(pairs).toEqual(dots.map((d) => `${d.getAttribute('cx')},${d.getAttribute('cy')}`));
    for (const d of dots) expect(d).toHaveAttribute('r', '4');
  });

  it('hovering a dot reports it and shows a tooltip; leaving clears both', () => {
    const onHover = vi.fn();
    const { container } = render(
      <ElevationProfile photos={[p1, p2, p3]} hoveredPhotoId={null} onHover={onHover} />
    );
    const dots = circles(container);
    fireEvent.mouseEnter(must(dots[2], 'p3 dot'));
    expect(onHover).toHaveBeenLastCalledWith('p3');
    expect(screen.getByText('180m · 2.2km')).toBeInTheDocument();
    // near the right edge the tooltip is pulled back inside the chart
    expect(must(container.querySelector('rect'), 'tooltip').getAttribute('x')).toBe('670');

    // the top dot puts the tooltip below it
    fireEvent.mouseEnter(must(dots[1], 'p2 dot'));
    expect(onHover).toHaveBeenLastCalledWith('p2');
    expect(screen.getByText('250m · 1.1km')).toBeInTheDocument();
    expect(must(container.querySelector('rect'), 'tooltip').getAttribute('y')).toBe('26');

    // the bottom dot puts the tooltip above it
    fireEvent.mouseEnter(must(dots[0], 'p1 dot'));
    expect(screen.getByText('100m · 0.0km')).toBeInTheDocument();
    expect(must(container.querySelector('rect'), 'tooltip').getAttribute('y')).toBe('62');

    fireEvent.mouseLeave(must(container.querySelector('svg'), 'svg'));
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(container.querySelector('rect')).toBeNull();
    expect(screen.queryByText(/km$/, { selector: 'g text' })).toBeNull();
  });

  it('hover and leave work without an onHover handler', () => {
    const { container } = render(<ElevationProfile photos={[p1, p2]} hoveredPhotoId={null} />);
    fireEvent.mouseEnter(must(circles(container)[0], 'dot'));
    expect(container.querySelector('rect')).not.toBeNull();
    fireEvent.mouseLeave(must(container.querySelector('svg'), 'svg'));
    expect(container.querySelector('rect')).toBeNull();
  });

  it('enlarges the dot of the photo hovered elsewhere', () => {
    const { container } = render(<ElevationProfile photos={[p1, p2, p3]} hoveredPhotoId="p2" />);
    const dots = circles(container);
    expect(dots.map((d) => d.getAttribute('r'))).toEqual(['4', '6', '4']);
    expect(dots[1]).toHaveAttribute('stroke-width', '2');
  });

  it('copes with a flat profile (all at one altitude)', () => {
    const flat2 = makePhoto({ ...p2, altitude: 100 });
    render(<ElevationProfile photos={[p1, flat2]} hoveredPhotoId={null} />);
    expect(screen.getByText('↑ 0m gain')).toBeInTheDocument();
    expect(screen.getByText('↓ 0m loss')).toBeInTheDocument();
    expect(screen.getByText('100–100m alt')).toBeInTheDocument();
  });

  // When every photo sits at the same spot the total distance is 0; the dots are then
  // spaced evenly (this divided by zero and drew NaN coordinates before).
  it('places dots at real coordinates when all photos share one location', () => {
    const sameSpot = makePhoto({ ...p2, lat: 50, lng: 0 });
    const { container } = render(
      <ElevationProfile photos={[p1, sameSpot]} hoveredPhotoId={null} />
    );
    for (const d of circles(container)) {
      expect(Number.isFinite(Number(d.getAttribute('cx')))).toBe(true);
    }
  });
});
