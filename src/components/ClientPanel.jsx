import { useState, useEffect } from 'react'

const PRESET_COLORS = ['#e97b25', '#3a86ff', '#8ecae6', '#06d6a0', '#ffb703']
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
  const [expandedClientIds, setExpandedClientIds] = useState(new Set())
  const [expandedProjectIds, setExpandedProjectIds] = useState(new Set())

  // Client creation
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')

  // Project creation (keyed by clientId)
  const [creatingProjectForClientId, setCreatingProjectForClientId] = useState(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectStatus, setNewProjectStatus] = useState('active')
  const [newProjectColor, setNewProjectColor] = useState(PRESET_COLORS[0])

  // Collection creation (keyed by projectId)
  const [creatingCollectionForProjectId, setCreatingCollectionForProjectId] = useState(null)
  const [newCollectionName, setNewCollectionName] = useState(TODAY)
  const [newCollectionColor, setNewCollectionColor] = useState(PRESET_COLORS[0])

  // Collection rename
  const [renamingCollectionId, setRenamingCollectionId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (activeClientId) setExpandedClientIds(prev => new Set([...prev, activeClientId]))
  }, [activeClientId])

  useEffect(() => {
    if (activeProjectId) setExpandedProjectIds(prev => new Set([...prev, activeProjectId]))
  }, [activeProjectId])

  // ─── Expand/collapse ────────────────────────────────────────────────────────

  function toggleClientExpand(id) {
    setExpandedClientIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleProjectExpand(id) {
    setExpandedProjectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ─── Selection handlers ──────────────────────────────────────────────────────

  function handleSelectClient(id) {
    onSelectClient(id)
    onSelectProject(null)
    onSelectCollection(null)
    setExpandedClientIds(prev => new Set([...prev, id]))
  }

  function handleSelectProject(clientId, projectId) {
    onSelectClient(clientId)
    onSelectProject(projectId)
    onSelectCollection(null)
    setExpandedClientIds(prev => new Set([...prev, clientId]))
    setExpandedProjectIds(prev => new Set([...prev, projectId]))
  }

  // ─── Client handlers ─────────────────────────────────────────────────────────

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

  // ─── Project handlers ────────────────────────────────────────────────────────

  function startCreatingProject(clientId) {
    setCreatingProjectForClientId(clientId)
    setNewProjectName('')
    setNewProjectStatus('active')
    setNewProjectColor(PRESET_COLORS[0])
    setExpandedClientIds(prev => new Set([...prev, clientId]))
  }

  function handleCreateProject() {
    if (!newProjectName.trim()) return
    onCreateProject({ name: newProjectName.trim(), clientId: creatingProjectForClientId, status: newProjectStatus, color: newProjectColor })
    setNewProjectName('')
    setNewProjectStatus('active')
    setNewProjectColor(PRESET_COLORS[0])
    setCreatingProjectForClientId(null)
  }

  function handleCancelProject() {
    setNewProjectName('')
    setNewProjectStatus('active')
    setNewProjectColor(PRESET_COLORS[0])
    setCreatingProjectForClientId(null)
  }

  // ─── Collection handlers ─────────────────────────────────────────────────────

  function startCreatingCollection(projectId) {
    setCreatingCollectionForProjectId(projectId)
    setNewCollectionName(TODAY)
    setNewCollectionColor(PRESET_COLORS[0])
    setExpandedProjectIds(prev => new Set([...prev, projectId]))
  }

  function handleCreateCollection() {
    if (!newCollectionName.trim()) return
    onCreateCollection({ name: newCollectionName.trim(), color: newCollectionColor, projectId: creatingCollectionForProjectId })
    setNewCollectionName(TODAY)
    setNewCollectionColor(PRESET_COLORS[0])
    setCreatingCollectionForProjectId(null)
  }

  function handleCancelCollection() {
    setNewCollectionName(TODAY)
    setNewCollectionColor(PRESET_COLORS[0])
    setCreatingCollectionForProjectId(null)
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

  // ─── Derived totals ──────────────────────────────────────────────────────────

  const totalPhotos = projects.reduce((sum, p) => sum + (p.photoCount || 0), 0)

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="client-panel">
      <div className="client-panel-header">
        <span className="client-panel-title">Clients</span>
        <button
          className="client-panel-add"
          onClick={() => setCreatingClient(true)}
          aria-label="New client"
          title="New client"
        >+</button>
      </div>

      <div className="client-tree">
        {/* All Photos row */}
        <div
          className={`client-tree-row${!activeClientId ? ' active' : ''}`}
          onClick={() => { onSelectClient(null); onSelectProject(null); onSelectCollection(null) }}
        >
          <span className="client-tree-name">All Photos</span>
          <span className="client-tree-badge">{totalPhotos}</span>
        </div>

        {/* Client rows */}
        {clients.map(cl => {
          const isExpanded = expandedClientIds.has(cl.id)
          const isSelected = activeClientId === cl.id && !activeProjectId
          const clientProjects = projects.filter(p => p.clientId === cl.id)

          return (
            <div key={cl.id}>
              <div className={`client-tree-row${isSelected ? ' active' : ''}`}>
                <button
                  className="client-tree-chevron"
                  onClick={e => { e.stopPropagation(); toggleClientExpand(cl.id) }}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
                <span className="client-tree-name" onClick={() => handleSelectClient(cl.id)}>{cl.name}</span>
                <span className="client-tree-badge">{cl.projectCount}</span>
                <span className="client-tree-actions">
                  <button
                    className="client-tree-add-btn"
                    onClick={e => { e.stopPropagation(); startCreatingProject(cl.id) }}
                    title="New project"
                  >+</button>
                  <button
                    className="client-tree-delete-btn"
                    onClick={e => { e.stopPropagation(); onDeleteClient(cl.id) }}
                    title="Delete"
                  >×</button>
                </span>
              </div>

              {isExpanded && (
                <div className="client-tree-children">
                  {clientProjects.map(proj => {
                    const isProjExpanded = expandedProjectIds.has(proj.id)
                    const isProjSelected = activeProjectId === proj.id && !activeCollectionId
                    const projCollections = collections.filter(c => c.projectId === proj.id)

                    return (
                      <div key={proj.id}>
                        <div className={`client-tree-row${isProjSelected ? ' active' : ''}`}>
                          <button
                            className="client-tree-chevron"
                            onClick={e => { e.stopPropagation(); toggleProjectExpand(proj.id) }}
                            aria-label={isProjExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isProjExpanded ? '▾' : '▸'}
                          </button>
                          <span className="client-tree-name" onClick={() => handleSelectProject(cl.id, proj.id)}>{proj.name}</span>
                          <span className={`project-status-badge project-status-${proj.status}`}>{proj.status}</span>
                          <span className="client-tree-badge">{proj.photoCount}</span>
                          <span className="client-tree-actions">
                            <button
                              className="client-tree-add-btn"
                              onClick={e => { e.stopPropagation(); startCreatingCollection(proj.id) }}
                              title="New survey"
                            >+</button>
                            <button
                              className="client-tree-delete-btn"
                              onClick={e => { e.stopPropagation(); onDeleteProject(proj.id) }}
                              title="Delete"
                            >×</button>
                          </span>
                        </div>

                        {isProjExpanded && (
                          <div className="client-tree-children client-tree-children--l2">
                            {projCollections.map(col => (
                              <div
                                key={col.id}
                                className={`client-tree-row${activeCollectionId === col.id ? ' active' : ''}`}
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
                                  <span
                                    className="client-tree-name"
                                    onClick={() => onSelectCollection(activeCollectionId === col.id ? null : col.id)}
                                  >{col.name}</span>
                                )}
                                <span className="client-tree-badge">{col.photoCount}</span>
                                <span className="client-tree-actions">
                                  <button
                                    className="collection-rename-btn"
                                    onClick={e => handleStartRenameCollection(col, e)}
                                    aria-label={`Rename ${col.name}`}
                                    title="Rename"
                                  >&#9998;</button>
                                  <button
                                    className="client-tree-delete-btn"
                                    onClick={e => { e.stopPropagation(); onDeleteCollection(col.id) }}
                                    aria-label={`Delete ${col.name}`}
                                    title="Delete"
                                  >×</button>
                                </span>
                              </div>
                            ))}

                            {creatingCollectionForProjectId === proj.id ? (
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
                                onClick={() => startCreatingCollection(proj.id)}
                              >+ Add survey date</button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {creatingProjectForClientId === cl.id && (
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
                </div>
              )}
            </div>
          )
        })}

        {clients.length === 0 && !creatingClient && (
          <p className="panel-empty-hint">No clients yet — add one to organise your photos.</p>
        )}

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
      </div>
    </div>
  )
}
