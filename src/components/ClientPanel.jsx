import { useState, useEffect, useMemo } from 'react'

export default function ClientPanel({
  clients,
  projects,
  photos,
  activeClientId,
  activeProjectId,
  activeSurveyDate,
  onSelectClient,
  onSelectProject,
  onSelectSurveyDate,
  onUpdateClient,
  onDeleteClient,
  onUpdateProject,
  onDeleteProject,
}) {
  const [expandedClientIds, setExpandedClientIds] = useState(new Set())
  const [expandedProjectIds, setExpandedProjectIds] = useState(new Set())

  // Inline rename state
  const [renamingClientId, setRenamingClientId] = useState(null)
  const [renameClientValue, setRenameClientValue] = useState('')
  const [renamingProjectId, setRenamingProjectId] = useState(null)
  const [renameProjectValue, setRenameProjectValue] = useState('')

  useEffect(() => {
    if (activeClientId) setExpandedClientIds(prev => new Set([...prev, activeClientId]))
  }, [activeClientId])

  useEffect(() => {
    if (activeProjectId) setExpandedProjectIds(prev => new Set([...prev, activeProjectId]))
  }, [activeProjectId])

  // Derive survey date groups from photos (most recent first, Undated last)
  const surveyDatesByProject = useMemo(() => {
    const map = {}
    for (const photo of photos) {
      if (!photo.projectId) continue
      const key = photo.surveyDate ?? '__undated__'
      if (!map[photo.projectId]) map[photo.projectId] = {}
      map[photo.projectId][key] = (map[photo.projectId][key] || 0) + 1
    }
    const result = {}
    for (const [pid, counts] of Object.entries(map)) {
      const dated = Object.entries(counts)
        .filter(([k]) => k !== '__undated__')
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([surveyDate, photoCount]) => ({ surveyDate, photoCount }))
      const undated = counts['__undated__'] ?? 0
      result[pid] = [...dated, ...(undated > 0 ? [{ surveyDate: null, photoCount: undated }] : [])]
    }
    return result
  }, [photos])

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
    onSelectSurveyDate(null)
    setExpandedClientIds(prev => new Set([...prev, id]))
  }

  function handleSelectProject(clientId, projectId) {
    onSelectClient(clientId)
    onSelectProject(projectId)
    onSelectSurveyDate(null)
    setExpandedClientIds(prev => new Set([...prev, clientId]))
    setExpandedProjectIds(prev => new Set([...prev, projectId]))
  }

  // ─── Rename handlers ─────────────────────────────────────────────────────────

  function startRenamingClient(cl) {
    setRenamingClientId(cl.id)
    setRenameClientValue(cl.name)
  }

  function commitRenameClient(id) {
    const name = renameClientValue.trim()
    if (name) onUpdateClient(id, { name })
    setRenamingClientId(null)
    setRenameClientValue('')
  }

  function startRenamingProject(proj) {
    setRenamingProjectId(proj.id)
    setRenameProjectValue(proj.name)
  }

  function commitRenameProject(id) {
    const name = renameProjectValue.trim()
    if (name) onUpdateProject(id, { name })
    setRenamingProjectId(null)
    setRenameProjectValue('')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="client-panel">
      <div className="client-tree">
        {/* Client rows */}
        {clients.map(cl => {
          const isExpanded = expandedClientIds.has(cl.id)
          const isSelected = activeClientId === cl.id && !activeProjectId
          const clientProjects = projects.filter(p => p.clientId === cl.id)
          const isRenamingClient = renamingClientId === cl.id

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
                {isRenamingClient ? (
                  <input
                    className="client-tree-rename-input"
                    value={renameClientValue}
                    onChange={e => setRenameClientValue(e.target.value)}
                    onBlur={() => commitRenameClient(cl.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRenameClient(cl.id)
                      if (e.key === 'Escape') { setRenamingClientId(null); setRenameClientValue('') }
                    }}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="client-tree-name"
                    onClick={() => handleSelectClient(cl.id)}
                    onDoubleClick={e => { e.stopPropagation(); startRenamingClient(cl) }}
                    title="Double-click to rename"
                  >{cl.name}</span>
                )}
                <span className="client-tree-badge">{cl.projectCount}</span>
                <span className="client-tree-actions">
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
                    const isProjSelected = activeProjectId === proj.id && !activeSurveyDate
                    const dateBuckets = surveyDatesByProject[proj.id] || []
                    const isRenamingProject = renamingProjectId === proj.id

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
                          {isRenamingProject ? (
                            <input
                              className="client-tree-rename-input"
                              value={renameProjectValue}
                              onChange={e => setRenameProjectValue(e.target.value)}
                              onBlur={() => commitRenameProject(proj.id)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitRenameProject(proj.id)
                                if (e.key === 'Escape') { setRenamingProjectId(null); setRenameProjectValue('') }
                              }}
                              autoFocus
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="client-tree-name"
                              onClick={() => handleSelectProject(cl.id, proj.id)}
                              onDoubleClick={e => { e.stopPropagation(); startRenamingProject(proj) }}
                              title="Double-click to rename"
                            >{proj.name}</span>
                          )}
                          <button
                            className={`project-status-badge project-status-${proj.status}`}
                            onClick={e => { e.stopPropagation(); onUpdateProject(proj.id, { name: proj.name, clientId: proj.clientId, color: proj.color, status: proj.status === 'active' ? 'archived' : 'active' }) }}
                            title={proj.status === 'active' ? 'Mark as archived' : 'Mark as active'}
                          >{proj.status}</button>
                          <span className="client-tree-badge">{proj.photoCount}</span>
                          <span className="client-tree-actions">
                            <button
                              className="client-tree-delete-btn"
                              onClick={e => { e.stopPropagation(); onDeleteProject(proj.id) }}
                              title="Delete"
                            >×</button>
                          </span>
                        </div>

                        {isProjExpanded && (
                          <div className="client-tree-children client-tree-children--l2">
                            {dateBuckets.map(({ surveyDate, photoCount }) => {
                              const dateKey = surveyDate ?? '__undated__'
                              const filterVal = surveyDate ?? 'undated'
                              const isActive = activeSurveyDate === filterVal && activeProjectId === proj.id
                              const display = surveyDate
                                ? surveyDate.split('-').reverse().join('/')
                                : 'Undated'
                              return (
                                <div
                                  key={dateKey}
                                  className={`client-tree-row${isActive ? ' active' : ''}`}
                                  onClick={() => {
                                    onSelectClient(cl.id)
                                    onSelectProject(proj.id)
                                    onSelectSurveyDate(isActive ? null : filterVal)
                                  }}
                                >
                                  <span className="client-tree-name survey-date-label">{display}</span>
                                  <span className="client-tree-badge">{photoCount}</span>
                                </div>
                              )
                            })}
                            {dateBuckets.length === 0 && (
                              <p className="panel-empty-hint" style={{ paddingLeft: 32 }}>No photos yet</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {clients.length === 0 && (
          <p className="panel-empty-hint">No clients yet — upload photos to get started.</p>
        )}
      </div>
    </div>
  )
}
