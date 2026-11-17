import { useMemo, useState } from 'react';
import type { Photo } from '../../shared/api.ts';

const W = 800;
const H = 120;
const PAD = { top: 12, right: 16, bottom: 28, left: 48 };
// Chart colours come from the design tokens, so the chart follows the theme. SVG
// presentation attributes can't read CSS variables, so these go in `style`.
const AXIS_LABEL = { fill: 'var(--fg-secondary)' };
const GRID = { stroke: 'var(--border-default)' };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Point {
  id: string;
  name: string;
  alt: number;
  dist: number;
  lat: number;
  lng: number;
}

export interface ElevationProfileProps {
  photos: Photo[];
  hoveredPhotoId: string | null;
  onHover?: (id: string | null) => void;
}

export function ElevationProfile({ photos, hoveredPhotoId, onHover }: ElevationProfileProps) {
  const [tooltip, setTooltip] = useState<{ cx: number; cy: number; p: Point } | null>(null);

  const points = useMemo(() => {
    const sorted = photos
      .flatMap((p) =>
        p.hasGps && p.lat != null && p.lng != null && p.altitude != null
          ? [{ ...p, lat: p.lat, lng: p.lng, altitude: p.altitude }]
          : []
      )
      .sort((a, b) => {
        const da = a.dateTaken || a.uploadedAt || '';
        const db = b.dateTaken || b.uploadedAt || '';
        return da.localeCompare(db);
      });

    if (sorted.length < 2) return [];

    let dist = 0;
    let prev: { lat: number; lng: number } | null = null;
    return sorted.map((p): Point => {
      if (prev) dist += haversineKm(prev.lat, prev.lng, p.lat, p.lng);
      prev = p;
      return { id: p.id, name: p.originalName, alt: p.altitude, dist, lat: p.lat, lng: p.lng };
    });
  }, [photos]);

  const stats = useMemo(() => {
    if (!points.length) return null;
    const alts = points.map((p) => p.alt);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const totalDist = points.at(-1)?.dist ?? 0;
    let gain = 0,
      loss = 0;
    points.forEach((p, i) => {
      const before = points[i - 1];
      if (!before) return;
      const d = p.alt - before.alt;
      if (d > 0) gain += d;
      else loss += Math.abs(d);
    });
    return { minAlt, maxAlt, totalDist, gain: Math.round(gain), loss: Math.round(loss) };
  }, [points]);

  if (points.length < 2 || !stats) return null;

  const maxDist = points.at(-1)?.dist ?? 0;
  const allAlts = points.map((p) => p.alt);
  const minAlt = Math.min(...allAlts);
  const maxAlt = Math.max(...allAlts);
  const altRange = maxAlt - minAlt || 1;

  // Photos all taken from one spot have no distance to spread over; fall back to
  // spacing them evenly, so the chart still shows how the altitude changed.
  const spacing = new Map(points.map((p, i) => [p, i / (points.length - 1)]));
  const xOf = (p: Point) =>
    PAD.left + (maxDist > 0 ? p.dist / maxDist : (spacing.get(p) ?? 0)) * INNER_W;
  const toX = (dist: number) => PAD.left + (maxDist > 0 ? dist / maxDist : 0) * INNER_W;
  const toY = (alt: number) => PAD.top + INNER_H - ((alt - minAlt) / altRange) * INNER_H;

  const polyline = points.map((p) => `${xOf(p)},${toY(p.alt)}`).join(' ');
  const area = [
    `${toX(0)},${PAD.top + INNER_H}`,
    ...points.map((p) => `${xOf(p)},${toY(p.alt)}`),
    `${PAD.left + INNER_W},${PAD.top + INNER_H}`,
  ].join(' ');

  const yTicks = 3;
  const yTickValues = Array.from(
    { length: yTicks },
    (_, i) => minAlt + (altRange * i) / (yTicks - 1)
  );

  return (
    <div className="elevation-panel">
      <div className="elevation-stats">
        <span>↑ {stats.gain}m gain</span>
        <span>↓ {stats.loss}m loss</span>
        <span>{stats.totalDist.toFixed(1)} km</span>
        <span>
          {Math.round(stats.minAlt)}–{Math.round(stats.maxAlt)}m alt
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="elevation-svg"
        onMouseLeave={() => {
          setTooltip(null);
          onHover?.(null);
        }}
      >
        {/* Area fill */}
        <polygon
          points={area}
          style={{ fill: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}
        />

        {/* Y-axis grid + labels */}
        {yTickValues.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={y}
                x2={PAD.left + INNER_W}
                y2={y}
                style={GRID}
                strokeWidth="1"
              />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" style={AXIS_LABEL} fontSize="9">
                {Math.round(v)}m
              </text>
            </g>
          );
        })}

        {/* X-axis */}
        <line
          x1={PAD.left}
          y1={PAD.top + INNER_H}
          x2={PAD.left + INNER_W}
          y2={PAD.top + INNER_H}
          style={GRID}
          strokeWidth="1"
        />
        <text x={PAD.left} y={H - 6} style={AXIS_LABEL} fontSize="9">
          0 km
        </text>
        <text x={PAD.left + INNER_W} y={H - 6} textAnchor="end" style={AXIS_LABEL} fontSize="9">
          {maxDist.toFixed(1)} km
        </text>

        {/* Polyline */}
        <polyline
          points={polyline}
          fill="none"
          style={{ stroke: 'var(--accent)' }}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {points.map((p) => {
          const cx = xOf(p);
          const cy = toY(p.alt);
          const isHovered = hoveredPhotoId === p.id;
          return (
            <circle
              key={p.id}
              cx={cx}
              cy={cy}
              r={isHovered ? 6 : 4}
              strokeWidth={isHovered ? 2 : 1}
              style={{
                fill: isHovered ? 'var(--bg-surface)' : 'var(--accent)',
                stroke: isHovered ? 'var(--accent)' : 'var(--bg-canvas)',
                cursor: 'pointer',
                transition: 'r 0.1s',
              }}
              onMouseEnter={() => {
                setTooltip({ cx, cy, p });
                onHover?.(p.id);
              }}
            />
          );
        })}

        {/* Tooltip */}
        {tooltip &&
          (() => {
            const { cx, cy, p } = tooltip;
            const tx = Math.min(cx, W - 130);
            const ty = cy - 30 < PAD.top ? cy + 14 : cy - 30;
            return (
              <g>
                <rect
                  x={tx}
                  y={ty}
                  width={120}
                  height={22}
                  rx="4"
                  style={{ fill: 'var(--bg-surface)', stroke: 'var(--border-default)' }}
                  strokeWidth="1"
                />
                <text x={tx + 6} y={ty + 14} style={{ fill: 'var(--fg-primary)' }} fontSize="10">
                  {Math.round(p.alt)}m · {p.dist.toFixed(1)}km
                </text>
              </g>
            );
          })()}
      </svg>
    </div>
  );
}
