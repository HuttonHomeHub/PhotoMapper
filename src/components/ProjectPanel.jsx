import { useState } from 'react'

const PRESET_COLORS = ['#e94560', '#3a86ff', '#8ecae6', '#06d6a0', '#ffb703']
const STATUSES = ['draft', 'active', 'complete', 'archived']

export default function ProjectPanel({ projects, activeProjectId, onSelect, onCreate, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(true)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClient, setNewClient] = useState('')
  const [newStatus, setNewStatus] = useState('active')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])

  function handleCreate() {
    if (!newName.trim()) return
    onCreate({ name: newName.trim(), client: newClient.trim() || null, status: newStatus, color: newColor })
    setNewName('')
    setNewClient('')
    setNewStatus('active')
    setNewColor(PRESET_COLORS[0])
    setCreatingNew(false)
  }

  function handleCancelCreate() {
    setNewName('')
    setNewClient('')
    setNewStatus('active')
    setNewColor(PRESET_COLORS[0])
    setCreatingNew(false)
  }

  function handleRowClick(id) {
    onSelect(activeProjectId === id ? null : id)
  }

  return (
    <div className="project-panel">
      <div className="project-panel-header">
        <span className="project-panel-title">Projects</span>
        <div className="project-panel-header-btns">
          <button
            className="project-panel-add"
            onClick={() => { setCreatingNew(true); setExpanded(true) }}
            aria-label="New project"
            title="New project"
          >+</button>
          <button
            className="project-panel-chevron"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="project-panel-body">
          {creatingNew && (
            <div className="project-new-form">
              <input
                className="project-new-input"
                type="text"
                placeholder="Project name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') handleCancelCreate() }}
                autoFocus
              />
              <input
                className="project-new-input"
                type="text"
                placeholder="Client (optional)"
                value={newClient}
                onChange={e => setNewClient(e.target.value)}
              />
              <select
                className="project-status-select"
                value={newStatus}
                onChange={e => setNewStatus(e.target.value)}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <div className="project-color-picker">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className={`color-swatch${newColor === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                    aria-label={c}
                  />
                ))}
              </div>
              <div className="project-new-form-actions">
                <button className="project-save-btn" onClick={handleCreate}>Save</button>
                <button className="project-cancel-btn" onClick={handleCancelCreate}>Cancel</button>
              </div>
            </div>
          )}

          <div
            className={`project-item${activeProjectId === null ? ' active' : ''}`}
            onClick={() => onSelect(null)}
          >
            <span className="project-dot" style={{ background: '#888' }} />
            <span className="project-name">All Photos</span>
          </div>

          {projects.map(proj => (
            <div
              key={proj.id}
              className={`project-item${activeProjectId === proj.id ? ' active' : ''}`}
              onClick={() => handleRowClick(proj.id)}
            >
              <span className="project-dot" style={{ background: proj.color }} />
              <span className="project-name">{proj.name}</span>
              {proj.client && <span className="project-client">{proj.client}</span>}
              <span className={`project-status-badge project-status-${proj.status}`}>{proj.status}</span>
              <span className="project-count">{proj.photoCount}</span>
              <span className="project-actions">
                <button
                  className="project-delete-btn"
                  onClick={e => { e.stopPropagation(); onDelete(proj.id) }}
                  aria-label={`Delete ${proj.name}`}
                  title="Delete"
                >&#215;</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
