// ARCH-02: timeline UI, driven entirely by the useTimeline hook (see App.jsx).
export function TimelinePanel({ timeline, photoCount }) {
  const { active, setActive, index, setIndex, playing, setPlaying, speed, setSpeed, sorted, currentDate } =
    timeline

  return (
    <div className="timeline-section">
      <button
        className={`timeline-toggle-btn${active ? ' active' : ''}`}
        onClick={() => setActive((a) => !a)}
        disabled={photoCount === 0}
      >
        {active ? '✕ Exit Timeline' : '▶ Play Timeline'}
      </button>
      {active && (
        <div className="timeline-controls">
          <div className="timeline-label">
            <span className="timeline-date">{currentDate}</span>
            <span className="timeline-counter">
              {index + 1} <span className="timeline-counter-sep">/</span> {sorted.length}
            </span>
          </div>
          <input
            type="range"
            className="timeline-scrubber"
            min={0}
            max={Math.max(0, sorted.length - 1)}
            value={index}
            aria-label={`Timeline: photo ${index + 1} of ${sorted.length}`}
            onChange={(e) => {
              setIndex(Number(e.target.value))
              setPlaying(false)
            }}
          />
          <div className="timeline-actions">
            <button
              className="timeline-play-btn"
              onClick={() => setPlaying((p) => !p)}
              disabled={sorted.length < 2}
              aria-label={playing ? 'Pause timeline' : 'Play timeline (Space)'}
              title="Space to play/pause"
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <select
              className="timeline-speed-select"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              aria-label="Playback speed"
            >
              <option value={1500}>Slow</option>
              <option value={800}>Normal</option>
              <option value={300}>Fast</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
