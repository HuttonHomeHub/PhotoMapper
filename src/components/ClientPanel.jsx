import { useState, useEffect, useMemo } from 'react';
import { ConfirmModal } from './ConfirmModal.jsx';

export default function ClientPanel({
  clients,
  projects,
  photos,
  loading = false,
  error = null,
  onRetry,
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
  onEnableShare,
  onDisableShare,
  toast,
}) {
  const [expandedClientIds, setExpandedClientIds] = useState(new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState(new Set());

  // Inline rename state
  const [renamingClientId, setRenamingClientId] = useState(null);
  const [renameClientValue, setRenameClientValue] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [renameProjectValue, setRenameProjectValue] = useState('');

  // FEAT: which project's share panel is open (null = none).
  const [sharePanelProjectId, setSharePanelProjectId] = useState(null);

  // FE-04: confirm destructive client/project deletes. { type, id, name }
  const [pendingDelete, setPendingDelete] = useState(null);

  const shareUrl = (token) => `${window.location.origin}/share/${token}`;

  async function handleShareClick(proj) {
    try {
      if (!proj.shareToken) await onEnableShare?.(proj.id);
      setSharePanelProjectId((cur) => (cur === proj.id ? null : proj.id));
    } catch (err) {
      toast?.(err.message || 'Could not create share link', 'error');
    }
  }

  async function handleCopyShare(token) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toast?.('Share link copied', 'success');
    } catch {
      toast?.('Could not copy — select and copy the link manually', 'error');
    }
  }

  async function handleStopSharing(proj) {
    try {
      await onDisableShare?.(proj.id);
      setSharePanelProjectId(null);
      toast?.('Sharing stopped', 'info');
    } catch (err) {
      toast?.(err.message || 'Could not stop sharing', 'error');
    }
  }

  useEffect(() => {
    if (activeClientId) setExpandedClientIds((prev) => new Set([...prev, activeClientId]));
  }, [activeClientId]);

  useEffect(() => {
    if (activeProjectId) setExpandedProjectIds((prev) => new Set([...prev, activeProjectId]));
  }, [activeProjectId]);

  // Derive survey date groups from photos (most recent first, Undated last)
  const surveyDatesByProject = useMemo(() => {
    const map = {};
    for (const photo of photos) {
      if (!photo.projectId) continue;
      const key = photo.surveyDate ?? '__undated__';
      if (!map[photo.projectId]) map[photo.projectId] = {};
      map[photo.projectId][key] = (map[photo.projectId][key] || 0) + 1;
    }
    const result = {};
    for (const [pid, counts] of Object.entries(map)) {
      const dated = Object.entries(counts)
        .filter(([k]) => k !== '__undated__')
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([surveyDate, photoCount]) => ({ surveyDate, photoCount }));
      const undated = counts['__undated__'] ?? 0;
      result[pid] = [...dated, ...(undated > 0 ? [{ surveyDate: null, photoCount: undated }] : [])];
    }
    return result;
  }, [photos]);

  // ─── Expand/collapse ────────────────────────────────────────────────────────

  function toggleClientExpand(id) {
    setExpandedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleProjectExpand(id) {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Selection handlers ──────────────────────────────────────────────────────

  function handleSelectClient(id) {
    onSelectClient(id);
    onSelectProject(null);
    onSelectSurveyDate(null);
    setExpandedClientIds((prev) => new Set([...prev, id]));
  }

  function handleSelectProject(clientId, projectId) {
    onSelectClient(clientId);
    onSelectProject(projectId);
    onSelectSurveyDate(null);
    setExpandedClientIds((prev) => new Set([...prev, clientId]));
    setExpandedProjectIds((prev) => new Set([...prev, projectId]));
  }

  // ─── Rename handlers ─────────────────────────────────────────────────────────

  function startRenamingClient(cl) {
    setRenamingClientId(cl.id);
    setRenameClientValue(cl.name);
  }

  function commitRenameClient(id) {
    const name = renameClientValue.trim();
    if (name) onUpdateClient(id, { name });
    setRenamingClientId(null);
    setRenameClientValue('');
  }

  function startRenamingProject(proj) {
    setRenamingProjectId(proj.id);
    setRenameProjectValue(proj.name);
  }

  function commitRenameProject(id) {
    const name = renameProjectValue.trim();
    if (name) onUpdateProject(id, { name });
    setRenamingProjectId(null);
    setRenameProjectValue('');
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="client-panel">
      {/* FE-06: surface load failures with a retry, instead of silently showing
          an empty tree. */}
      {error && (
        <div className="panel-error" role="alert">
          <span>Couldn’t load clients &amp; projects.</span>
          {onRetry && (
            <button type="button" className="panel-error-retry" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
      <div className="client-tree">
        {/* FE-06: loading placeholder only when there is nothing to show yet;
            a background refresh keeps the existing tree visible. */}
        {loading && !error && clients.length === 0 && (
          <p className="panel-loading-hint" role="status">
            Loading…
          </p>
        )}
        {/* Client rows */}
        {clients.map((cl) => {
          const isExpanded = expandedClientIds.has(cl.id);
          const isSelected = activeClientId === cl.id && !activeProjectId;
          const clientProjects = projects.filter((p) => p.clientId === cl.id);
          const isRenamingClient = renamingClientId === cl.id;

          return (
            <div key={cl.id}>
              <div className={`client-tree-row${isSelected ? ' active' : ''}`}>
                <button
                  className="client-tree-chevron"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleClientExpand(cl.id);
                  }}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
                <span className="client-tree-icon" aria-hidden="true">
                  {isExpanded ? '📂' : '📁'}
                </span>
                {isRenamingClient ? (
                  <input
                    className="client-tree-rename-input"
                    value={renameClientValue}
                    onChange={(e) => setRenameClientValue(e.target.value)}
                    onBlur={() => commitRenameClient(cl.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRenameClient(cl.id);
                      if (e.key === 'Escape') {
                        setRenamingClientId(null);
                        setRenameClientValue('');
                      }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="client-tree-name"
                    onClick={() => handleSelectClient(cl.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRenamingClient(cl);
                    }}
                    title="Double-click to rename"
                  >
                    {cl.name}
                  </span>
                )}
                <span className="client-tree-badge">{cl.projectCount}</span>
                <span className="client-tree-actions">
                  <button
                    className="client-tree-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete({ type: 'client', id: cl.id, name: cl.name });
                    }}
                    title="Delete"
                  >
                    ×
                  </button>
                </span>
              </div>

              {isExpanded && (
                <div className="client-tree-children">
                  {clientProjects.map((proj) => {
                    const isProjExpanded = expandedProjectIds.has(proj.id);
                    const isProjSelected = activeProjectId === proj.id && !activeSurveyDate;
                    const dateBuckets = surveyDatesByProject[proj.id] || [];
                    const isRenamingProject = renamingProjectId === proj.id;

                    return (
                      <div key={proj.id}>
                        <div className={`client-tree-row${isProjSelected ? ' active' : ''}`}>
                          <button
                            className="client-tree-chevron"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProjectExpand(proj.id);
                            }}
                            aria-label={isProjExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isProjExpanded ? '▾' : '▸'}
                          </button>
                          <span className="client-tree-icon" aria-hidden="true">
                            {isProjExpanded ? '📂' : '📁'}
                          </span>
                          {isRenamingProject ? (
                            <input
                              className="client-tree-rename-input"
                              value={renameProjectValue}
                              onChange={(e) => setRenameProjectValue(e.target.value)}
                              onBlur={() => commitRenameProject(proj.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRenameProject(proj.id);
                                if (e.key === 'Escape') {
                                  setRenamingProjectId(null);
                                  setRenameProjectValue('');
                                }
                              }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="client-tree-name"
                              onClick={() => handleSelectProject(cl.id, proj.id)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRenamingProject(proj);
                              }}
                              title="Double-click to rename"
                            >
                              {proj.name}
                            </span>
                          )}
                          <button
                            className={`project-status-badge project-status-${proj.status}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateProject(proj.id, {
                                name: proj.name,
                                clientId: proj.clientId,
                                color: proj.color,
                                status: proj.status === 'active' ? 'archived' : 'active',
                              });
                            }}
                            title={proj.status === 'active' ? 'Mark as archived' : 'Mark as active'}
                          >
                            {proj.status}
                          </button>
                          <span className="client-tree-badge">{proj.photoCount}</span>
                          <span className="client-tree-actions">
                            <button
                              className={`client-tree-share-btn${proj.shareToken ? ' active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareClick(proj);
                              }}
                              title={
                                proj.shareToken ? 'Shared — manage link' : 'Share read-only link'
                              }
                              aria-label={proj.shareToken ? 'Manage share link' : 'Share project'}
                            >
                              🔗
                            </button>
                            <button
                              className="client-tree-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDelete({ type: 'project', id: proj.id, name: proj.name });
                              }}
                              title="Delete"
                            >
                              ×
                            </button>
                          </span>
                        </div>

                        {sharePanelProjectId === proj.id && proj.shareToken && (
                          <div className="share-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="share-panel-label">Public read-only link</div>
                            <input
                              className="share-panel-url"
                              value={shareUrl(proj.shareToken)}
                              readOnly
                              onFocus={(e) => e.target.select()}
                              aria-label="Share link"
                            />
                            <div className="share-panel-actions">
                              <button
                                className="share-panel-btn"
                                onClick={() => handleCopyShare(proj.shareToken)}
                              >
                                Copy link
                              </button>
                              <button
                                className="share-panel-btn share-panel-btn--danger"
                                onClick={() => handleStopSharing(proj)}
                              >
                                Stop sharing
                              </button>
                            </div>
                            <div className="share-panel-hint">
                              Anyone with this link can view this project’s photos — no login.
                            </div>
                          </div>
                        )}

                        {isProjExpanded && (
                          <div className="client-tree-children client-tree-children--l2">
                            {dateBuckets.map(({ surveyDate, photoCount }) => {
                              const dateKey = surveyDate ?? '__undated__';
                              const filterVal = surveyDate ?? 'undated';
                              const isActive =
                                activeSurveyDate === filterVal && activeProjectId === proj.id;
                              const display = surveyDate
                                ? surveyDate.split('-').reverse().join('/')
                                : 'Undated';
                              return (
                                <div
                                  key={dateKey}
                                  className={`client-tree-row${isActive ? ' active' : ''}`}
                                  onClick={() => {
                                    onSelectClient(cl.id);
                                    onSelectProject(proj.id);
                                    onSelectSurveyDate(isActive ? null : filterVal);
                                  }}
                                >
                                  <span className="client-tree-chevron-spacer" aria-hidden="true" />
                                  <span
                                    className="client-tree-icon client-tree-icon--date"
                                    aria-hidden="true"
                                  >
                                    📅
                                  </span>
                                  <span className="client-tree-name survey-date-label">
                                    {display}
                                  </span>
                                  <span className="client-tree-badge">{photoCount}</span>
                                </div>
                              );
                            })}
                            {dateBuckets.length === 0 && (
                              <p className="panel-empty-hint" style={{ paddingLeft: 32 }}>
                                No photos yet
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!loading && !error && clients.length === 0 && (
          <p className="panel-empty-hint">No clients yet — upload photos to get started.</p>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title={pendingDelete.type === 'client' ? 'Delete client?' : 'Delete project?'}
          message={
            <>
              <span className="confirm-modal-filename">{pendingDelete.name}</span>
              <br />
              {pendingDelete.type === 'client'
                ? 'Its projects will be unassigned (not deleted).'
                : 'Its photos will be unassigned (not deleted).'}{' '}
              This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => {
            if (pendingDelete.type === 'client') onDeleteClient(pendingDelete.id);
            else onDeleteProject(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
