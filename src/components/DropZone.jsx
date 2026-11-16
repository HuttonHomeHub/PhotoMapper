import { useState, useRef } from 'react';
import { ApiError, apiFetch } from '@hhh/ui';

function AssignModal({ fileCount, clients, projects, onConfirm, onSkip }) {
  const defaultMode = clients.length > 0 ? 'existing' : 'new';
  const [mode, setMode] = useState(defaultMode);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const clientProjects = clientId ? projects.filter((p) => p.clientId === clientId) : projects;

  function handleClientChange(e) {
    setClientId(e.target.value);
    setProjectId('');
  }

  const canUpload =
    mode === 'existing' || mode === 'skip' || (mode === 'new' && newClientName.trim().length > 0);

  async function handleUpload() {
    if (!canUpload) return;
    if (mode === 'skip') {
      onSkip();
      return;
    }
    if (mode === 'existing') {
      onConfirm(projectId || null);
      return;
    }
    // mode === 'new'
    setCreating(true);
    try {
      const client = await apiFetch('/api/clients', {
        method: 'POST',
        body: { name: newClientName.trim() },
      });

      let finalProjectId = null;
      if (newProjectName.trim()) {
        const proj = await apiFetch('/api/projects', {
          method: 'POST',
          body: {
            name: newProjectName.trim(),
            clientId: client.id,
            status: 'active',
            color: '#3a86ff',
          },
        });
        finalProjectId = proj.id;
      }

      onConfirm(finalProjectId);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="assign-modal-overlay" onClick={onSkip}>
      <div className="assign-modal" onClick={(e) => e.stopPropagation()}>
        <p className="assign-modal-title">
          Where should {fileCount === 1 ? 'this photo' : `these ${fileCount} photos`} go?
        </p>

        <div className="assign-modal-modes">
          {clients.length > 0 && (
            <button
              className={`assign-modal-mode-btn${mode === 'existing' ? ' active' : ''}`}
              onClick={() => setMode('existing')}
            >
              Existing client / project
            </button>
          )}
          <button
            className={`assign-modal-mode-btn${mode === 'new' ? ' active' : ''}`}
            onClick={() => setMode('new')}
          >
            New client
          </button>
          <button
            className={`assign-modal-mode-btn${mode === 'skip' ? ' active' : ''}`}
            onClick={() => setMode('skip')}
          >
            No assignment
          </button>
        </div>

        {mode === 'existing' && (
          <>
            <div className="assign-modal-field">
              <label className="assign-modal-label">Client</label>
              <select
                className="assign-modal-select"
                value={clientId}
                onChange={handleClientChange}
              >
                <option value="">— any client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="assign-modal-field">
              <label className="assign-modal-label">Project</label>
              <select
                className="assign-modal-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={clientProjects.length === 0}
              >
                <option value="">— none —</option>
                {clientProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {mode === 'new' && (
          <>
            <div className="assign-modal-field">
              <label className="assign-modal-label">Client name</label>
              <input
                className="assign-modal-input"
                type="text"
                placeholder="e.g. Acme Corp"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canUpload) handleUpload();
                }}
                autoFocus
              />
            </div>
            <div className="assign-modal-field">
              <label className="assign-modal-label">
                Project name <span className="assign-modal-optional">(optional)</span>
              </label>
              <input
                className="assign-modal-input"
                type="text"
                placeholder="e.g. Site Survey"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canUpload) handleUpload();
                }}
              />
              <p className="assign-modal-hint">Leave blank to assign a project later.</p>
            </div>
          </>
        )}

        {mode === 'skip' && (
          <p className="assign-modal-hint">
            Photos will upload without a client or project. You can assign them later.
          </p>
        )}

        <div className="assign-modal-actions">
          <button
            className="assign-modal-primary"
            onClick={handleUpload}
            disabled={!canUpload || creating}
          >
            {creating ? 'Creating…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DropZone({
  onUploadComplete,
  setResults,
  openDrawer,
  clients = [],
  projects = [],
  activeProjectId,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState(null);
  const inputRef = useRef(null);

  async function uploadFile(file, projectId) {
    // PERF-07: no client-side hashing/pre-check — the server dedupes by content
    // hash (unique index) and returns 409 for duplicates. This avoids reading
    // the whole file into memory in the browser and an extra round-trip.
    const formData = new FormData();
    formData.append('photo', file);
    if (projectId) formData.append('projectId', projectId);

    try {
      return await apiFetch('/api/photos', { method: 'POST', body: formData });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const dup = new Error('Already uploaded');
        dup.isDuplicate = true;
        throw dup;
      }
      throw err;
    }
  }

  async function processFiles(fileList, projectId) {
    const files = Array.from(fileList);
    if (!files.length) return;

    const entries = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      status: 'uploading',
    }));
    setResults(entries);
    openDrawer();

    const updates = await Promise.all(
      files.map(async (file, i) => {
        const id = entries[i].id;
        try {
          const photo = await uploadFile(file, projectId);
          return {
            id,
            status: photo.hasGps ? 'success' : 'no-gps',
            detail: photo.hasGps ? null : 'No GPS data — pin not shown on map',
          };
        } catch (err) {
          if (err.isDuplicate) return { id, status: 'duplicate', detail: 'Already uploaded' };
          return { id, status: 'error', detail: err.message };
        }
      })
    );

    setResults((prev) =>
      prev.map((e) => {
        const update = updates.find((u) => u.id === e.id);
        return update ? { ...e, status: update.status, detail: update.detail } : e;
      })
    );

    if (updates.some((u) => u.status === 'success' || u.status === 'no-gps')) onUploadComplete();
  }

  function handleFiles(fileList) {
    if (!fileList?.length) return;
    if (activeProjectId) {
      processFiles(fileList, activeProjectId);
    } else {
      setPendingFiles(fileList);
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  function onDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function onClick() {
    inputRef.current?.click();
  }

  function onInputChange(e) {
    handleFiles(e.target.files);
    e.target.value = '';
  }

  function handleModalConfirm(projectId) {
    const files = pendingFiles;
    setPendingFiles(null);
    processFiles(files, projectId);
  }

  function handleModalSkip() {
    const files = pendingFiles;
    setPendingFiles(null);
    processFiles(files, null);
  }

  return (
    <>
      {pendingFiles && (
        <AssignModal
          fileCount={pendingFiles.length}
          clients={clients}
          projects={projects}
          onConfirm={handleModalConfirm}
          onSkip={handleModalSkip}
        />
      )}

      <div className="dropzone-wrapper">
        <div
          className={`dropzone${isDragOver ? ' active' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onClick()}
        >
          <div className="dropzone-icon">📷</div>
          <p>
            <strong>Drop photos here</strong>
            <br />
            or click to browse
            <br />
            JPEG · PNG · HEIC · WebP
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/heic,image/webp"
            onChange={onInputChange}
          />
        </div>
      </div>
    </>
  );
}
