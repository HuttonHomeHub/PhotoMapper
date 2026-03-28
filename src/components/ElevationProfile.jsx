import { useMemo, useState } from 'react'

const W = 800
const H = 120
const PAD = { top: 12, right: 16, bottom: 28, left: 48 }
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function ElevationProfile({ photos, hoveredPhotoId, onHover }) {
  const [tooltip, setTooltip] = useState(null)

  const points = useMemo(() => {
    const sorted = [...photos]
      .filter(p => p.hasGps && p.lat != null && p.lng != null && p.altitude != null)
      .sort((a, b) => {
        const da = a.dateTaken || a.uploadedAt || ''
        const db = b.dateTaken || b.uploadedAt || ''
        return da.localeCompare(db)
      })

    if (sorted.length < 2) return []

    let dist = 0
    return sorted.map((p, i) => {
      if (i > 0) {
        dist += haversineKm(sorted[i - 1].lat, sorted[i - 1].lng, p.lat, p.lng)
      }
      return { id: p.id, name: p.originalName, alt: p.altitude, dist }
    })
  }, [photos])

  const stats = useMemo(() => {
    if (!points.length) return null
    const alts = points.map(p => p.alt)
    const minAlt = Math.min(...alts)
    const maxAlt = Math.max(...alts)
    const totalDist = points[points.length - 1].dist
    let gain = 0, loss = 0
    for (let i = 1; i < points.length; i++) {
      const d = points[i].alt - points[i - 1].alt
      if (d > 0) gain += d
      else loss += Math.abs(d)
    }
    return { minAlt, maxAlt, totalDist, gain: Math.round(gain), loss: Math.round(loss) }
  }, [points])

  if (points.length < 2) return null

  const maxDist = points[points.length - 1].dist
  const allAlts = points.map(p => p.alt)
  const minAlt = Math.min(...allAlts)
  const maxAlt = Math.max(...allAlts)
  const altRange = maxAlt - minAlt || 1

  const toX = dist => PAD.left + (dist / maxDist) * INNER_W
  const toY = alt => PAD.top + INNER_H - ((alt - minAlt) / altRange) * INNER_H

  const polyline = points.map(p => `${toX(p.dist)},${toY(p.alt)}`).join(' ')
  const area = [
    `${toX(0)},${PAD.top + INNER_H}`,
    ...points.map(p => `${toX(p.dist)},${toY(p.alt)}`),
    `${toX(maxDist)},${PAD.top + INNER_H}`
  ].join(' ')

  const yTicks = 3
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    minAlt + (altRange * i) / (yTicks - 1)
  )

  return (
    <div className="elevation-panel">
      <div className="elevation-stats">
        <span>↑ {stats.gain}m gain</span>
        <span>↓ {stats.loss}m loss</span>
        <span>{stats.totalDist.toFixed(1)} km</span>
        <span>{Math.round(stats.minAlt)}–{Math.round(stats.maxAlt)}m alt</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="elevation-svg"
        onMouseLeave={() => { setTooltip(null); onHover?.(null) }}
      >
        {/* Area fill */}
        <polygon points={area} fill="rgba(233,69,96,0.15)" />

        {/* Y-axis grid + labels */}
        {yTickValues.map((v, i) => {
          const y = toY(v)
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={PAD.left + INNER_W} y2={y} stroke="#0f3460" strokeWidth="1" />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fill="#555" fontSize="9">{Math.round(v)}m</text>
            </g>
          )
        })}

        {/* X-axis */}
        <line x1={PAD.left} y1={PAD.top + INNER_H} x2={PAD.left + INNER_W} y2={PAD.top + INNER_H} stroke="#0f3460" strokeWidth="1" />
        <text x={PAD.left} y={H - 6} fill="#555" fontSize="9">0 km</text>
        <text x={PAD.left + INNER_W} y={H - 6} textAnchor="end" fill="#555" fontSize="9">{maxDist.toFixed(1)} km</text>

        {/* Polyline */}
        <polyline points={polyline} fill="none" stroke="#e94560" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Dots */}
        {points.map(p => {
          const cx = toX(p.dist)
          const cy = toY(p.alt)
          const isHovered = hoveredPhotoId === p.id
          return (
            <circle
              key={p.id}
              cx={cx}
              cy={cy}
              r={isHovered ? 6 : 4}
              fill={isHovered ? '#fff' : '#e94560'}
              stroke={isHovered ? '#e94560' : '#1a1a2e'}
              strokeWidth={isHovered ? 2 : 1}
              style={{ cursor: 'pointer', transition: 'r 0.1s' }}
              onMouseEnter={() => {
                setTooltip({ cx, cy, p })
                onHover?.(p.id)
              }}
            />
          )
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const { cx, cy, p } = tooltip
          const tx = Math.min(cx, W - 130)
          const ty = cy - 30 < PAD.top ? cy + 14 : cy - 30
          return (
            <g>
              <rect x={tx} y={ty} width={120} height={22} rx="4" fill="#16213e" stroke="#0f3460" strokeWidth="1" />
              <text x={tx + 6} y={ty + 14} fill="#e0e0e0" fontSize="10">
                {Math.round(p.alt)}m · {p.dist.toFixed(1)}km
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
