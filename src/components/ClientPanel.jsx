import { useState } from 'react'

const PRESET_COLORS = ['#e94560', '#3a86ff', '#8ecae6', '#06d6a0', '#ffb703']
const STATUSES = ['draft', 'active', 'complete', 'archived']
const TODAY = new Date().toISOString().slice(0, 10)

export default function ClientPanel({
  clients,
  projects,
  collections,
  activeClientId,
  activeProjectId,
  activeCollectionId,
  onSelectClient,
  onSelectProject,
  onSelectCollection,
  onCreateClient,
  onUpdateClient,
  onDeleteClient,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onCreateCollection,
  onUpdateCollection,
  onDeleteCollection,
}) {
  const [expanded, setExpanded] = useState(true)

  // Level 0 — client creation
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')

  // Level 1 — project creation
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectStatus, setNewProjectStatus] = useState('active')
  const [newProjectColor, setNewProjectColor] = useState(PRESET_COLORS[0])

  // Level 2 — collection creation
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState(TODAY)
  const [newCollectionColor, setNewCollectionColor] = useState(PRESET_COLORS[0])

  // Collection rename
  const [renamingCollectionId, setRenamingCollectionId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  // Derived data
  const activeClient = clients.find(c => c.id === activeClientId)
  const activeProject = projects.find(p => p.id === activeProjectId)
  const clientProjects = projects.filter(p => p.clientId === activeClientId)
  const projectCollections = collections.filter(c => c.projectId === activeProjectId)

  // ─── Level 0 handlers ───────────────────────────────────────────────────────

  function handleCreateClient() {
    if (!newClientName.trim()) return
    onCreateClient({ name: newClientName.trim() })
    setNewClientName('')
    setCreatingClient(false)
  }

  function handleCancelClient() {
    setNewClientName('')
    setCreatingClient(false)
  }

  // ─── Level 1 handlers ───────────────────────────────────────────────────────

  function handleCreateProject() {
    if (!newProjectName.trim()) return
    onCreateProject({ name: newProjectName.trim(), clientId: activeClientId, status: newProjectStatus, color: newProjectColor })
    setNewProjectName('')
    setNewProjectStatus('active')
    setNewProjectColor(PRESET_COLORS[0])
    setCreatingProject(false)
  }

  function handleCancelProject() {
    setNewProjectName('')
    setNewProjectStatus('active')
    setNewProjectColor(PRESET_COLORS[0])
    setCreatingProject(false)
  }

  // ─── Level 2 handlers ───────────────────────────────────────────────────────

  function handleCreateCollection() {
    if (!newCollectionName.trim()) return
    onCreateCollection({ name: newCollectionName.trim(), color: newCollectionColor, projectId: activeProjectId })
    setNewCollectionName(TODAY)
    setNewCollectionColor(PRESET_COLORS[0])
    setCreatingCollection(false)
  }

  function handleCancelCollection() {
    setNewCollectionName(TODAY)
    setNewCollectionColor(PRESET_COLORS[0])
    setCreatingCollection(false)
  }

  function handleStartRenameCollection(col, e) {
    e.stopPropagation()
    setRenamingCollectionId(col.id)
    setRenameValue(col.name)
  }

  function handleRenameCollection(id) {
    if (!renameValue.trim()) return
    onUpdateCollection(id, { name: renameValue.trim() })
    setRenamingCollectionId(null)
    setRenameValue('')
  }

  // ─── Level 2 — Collections under a project ──────────────────────────────────

  if (activeProjectId) {
    return (
      <div className="client-panel">
        <div className="client-panel-header">
          <div className="client-breadcrumb">
            <button
              className="client-breadcrumb-back"
              onClick={() => onSelectProject(null)}
              title="Back to projects"
            >
              ← {activeClient?.name ?? 'Client'}
            </button>
            <span className="client-breadcrumb-sep"> › </span>
            <span className="client-breadcrumb-current">{activeProject?.name ?? 'Project'}</span>
          </div>
          <button
            className="client-panel-chevron"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        </div>

        {expanded && (
          <div className="client-panel-body">
            <div
              className={`collection-item${activeCollectionId === null ? ' active' : ''}`}
              onClick={() => onSelectCollection(null)}
            >
              <span className="collection-dot" style={{ background: '#888' }} />
              <span className="collection-name">All {activeProject?.name} photos</span>
            </div>

            {projectCollections.map(col => (
              <div
                key={col.id}
                className={`collection-item${activeCollectionId === col.id ? ' active' : ''}`}
                onClick={() => renamingCollectionId !== col.id && onSelectCollection(activeCollectionId === col.id ? null : col.id)}
              >
                <span className="collection-dot" style={{ background: col.color }} />

                {renamingCollectionId === col.id ? (
                  <input
                    className="collection-rename-input"
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameCollection(col.id)
                      if (e.key === 'Escape') { setRenamingCollectionId(null); setRenameValue('') }
                    }}
                    onBlur={() => handleRenameCollection(col.id)}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="collection-name">{col.name}</span>
                )}

                <span className="collection-count">{col.photoCount}</span>
                <span className="collection-actions">
                  <button
                    className="collection-rename-btn"
                    onClick={e => handleStartRenameCollection(col, e)}
                    aria-label={`Rename ${col.name}`}
                    title="Rename"
                  >&#9998;</button>
                  <button
                    className="collection-delete-btn"
                    onClick={e => { e.stopPropagation(); onDeleteCollection(col.id) }}
                    aria-label={`Delete ${col.name}`}
                    title="Delete"
                  >&#215;</button>
                </span>
              </div>
            ))}

            {creatingCollection ? (
              <div className="collection-new-form">
                <input
                  className="collection-new-input"
                  type="text"
                  placeholder="Survey date or name"
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateCollection(); if (e.key === 'Escape') handleCancelCollection() }}
                  autoFocus
                />
                <div className="collection-color-picker">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      className={`color-swatch${newCollectionColor === c ? ' selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setNewCollectionColor(c)}
                      aria-label={c}
                    />
                  ))}
                </div>
                <div className="collection-new-form-actions">
                  <button className="collection-save-btn" onClick={handleCreateCollection}>Save</button>
                  <button className="collection-cancel-btn" onClick={handleCancelCollection}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                className="client-add-survey-btn"
                onClick={() => { setNewCollectionName(TODAY); setCreatingCollection(true) }}
              >
                + Add survey date
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Level 1 — Projects under a client ──────────────────────────────────────

  if (activeClientId) {
    return (
      <div className="client-panel">
        <div className="client-panel-header">
          <div className="client-breadcrumb">
            <button
              className="client-breadcrumb-back"
              onClick={() => onSelectClient(null)}
              title="Back to clients"
            >
              ← Clients
            </button>
            <span className="client-breadcrumb-sep"> › </span>
            <span className="client-breadcrumb-current">{activeClient?.name ?? 'Client'}</span>
          </div>
          <div className="client-panel-header-btns">
            <button
              className="client-panel-add"
              onClick={() => { setCreatingProject(true); setExpanded(true) }}
              aria-label="New project"
              title="New project"
            >+</button>
            <button
              className="client-panel-chevron"
              onClick={() => setExpanded(v => !v)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '▾' : '▸'}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="client-panel-body">
            {creatingProject && (
              <div className="project-new-form">
                <input
                  className="project-new-input"
                  type="text"
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') handleCancelProject() }}
                  autoFocus
                />
                <select
                  className="project-status-select"
                  value={newProjectStatus}
                  onChange={e => setNewProjectStatus(e.target.value)}
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
                <div className="project-color-picker">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      className={`color-swatch${newProjectColor === c ? ' selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setNewProjectColor(c)}
                      aria-label={c}
                    />
                  ))}
                </div>
                <div className="project-new-form-actions">
                  <button className="project-save-btn" onClick={handleCreateProject}>Save</button>
                  <button className="project-cancel-btn" onClick={handleCancelProject}>Cancel</button>
                </div>
              </div>
            )}

            <div
              className={`project-item${activeProjectId === null ? ' active' : ''}`}
              onClick={() => onSelectProject(null)}
            >
              <span className="project-dot" style={{ background: '#888' }} />
              <span className="project-name">All {activeClient.name} photos</span>
            </div>

            {clientProjects.map(proj => (
              <div
                key={proj.id}
                className={`project-item${activeProjectId === proj.id ? ' active' : ''}`}
                onClick={() => onSelectProject(activeProjectId === proj.id ? null : proj.id)}
              >
                <span className="project-dot" style={{ background: proj.color }} />
                <span className="project-name">{proj.name}</span>
                <span className={`project-status-badge project-status-${proj.status}`}>{proj.status}</span>
                <span className="project-count">{proj.photoCount}</span>
                <span className="project-actions">
                  <button
                    className="project-delete-btn"
                    onClick={e => { e.stopPropagation(); onDeleteProject(proj.id) }}
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

  // ─── Level 0 — Client list ───────────────────────────────────────────────────

  return (
    <div className="client-panel">
      <div className="client-panel-header">
        <span className="client-panel-title">Clients</span>
        <div className="client-panel-header-btns">
          <button
            className="client-panel-add"
            onClick={() => { setCreatingClient(true); setExpanded(true) }}
            aria-label="New client"
            title="New client"
          >+</button>
          <button
            className="client-panel-chevron"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="client-panel-body">
          {creatingClient && (
            <div className="project-new-form">
              <input
                className="project-new-input"
                type="text"
                placeholder="Client name"
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateClient(); if (e.key === 'Escape') handleCancelClient() }}
                autoFocus
              />
              <div className="project-new-form-actions">
                <button className="project-save-btn" onClick={handleCreateClient}>Save</button>
                <button className="project-cancel-btn" onClick={handleCancelClient}>Cancel</button>
              </div>
            </div>
          )}

          <div
            className={`client-item${activeClientId === null ? ' active' : ''}`}
            onClick={() => onSelectClient(null)}
          >
            <span className="client-dot" style={{ background: '#888' }} />
            <span className="client-name">All Photos</span>
          </div>

          {clients.map(cl => (
            <div
              key={cl.id}
              className={`client-item${activeClientId === cl.id ? ' active' : ''}`}
              onClick={() => onSelectClient(activeClientId === cl.id ? null : cl.id)}
            >
              <span className="client-dot" style={{ background: '#e94560' }} />
              <span className="client-name">{cl.name}</span>
              <span className="client-count">{cl.projectCount}</span>
              <span className="client-actions">
                <button
                  className="client-delete-btn"
                  onClick={e => { e.stopPropagation(); onDeleteClient(cl.id) }}
                  aria-label={`Delete ${cl.name}`}
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
