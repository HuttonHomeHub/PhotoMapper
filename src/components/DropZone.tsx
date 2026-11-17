import { useState, useRef, type ChangeEvent, type DragEvent, type SetStateAction } from 'react';
import type { Client, Project } from '../../shared/api.ts';
import { DuplicatePhotoError, useUpload } from '../hooks/useUpload.ts';
import type { UploadResult } from './UploadDrawer.tsx';

// Keys for the upload log's rows. Not crypto.randomUUID: that only exists on HTTPS or
// localhost pages, and the app is also used over plain HTTP (the dev copy, tests).
let nextUploadId = 0;
const uploadId = () => `upload-${++nextUploadId}`;

interface AssignModalProps {
  fileCount: number;
  clients: Client[];
  projects: Project[];
  onConfirm: (projectId: string | null) => void;
  onSkip: () => void;
}

function AssignModal({ fileCount, clients, projects, onConfirm, onSkip }: AssignModalProps) {
  const { createClientWithProject } = useUpload();
  const defaultMode = clients.length > 0 ? 'existing' : 'new';
  const [mode, setMode] = useState<'existing' | 'new' | 'skip'>(defaultMode);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const clientProjects = clientId ? projects.filter((p) => p.clientId === clientId) : projects;

  function handleClientChange(e: ChangeEvent<HTMLSelectElement>) {
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
      onConfirm(await createClientWithProject(newClientName.trim(), newProjectName.trim()));
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

export interface DropZoneProps {
  onUploadComplete: () => void;
  setResults: (value: SetStateAction<UploadResult[]>) => void;
  openDrawer: () => void;
  clients?: Client[];
  projects?: Project[];
  activeProjectId?: string | null;
}

export function DropZone({
  onUploadComplete,
  setResults,
  openDrawer,
  clients = [],
  projects = [],
  activeProjectId,
}: DropZoneProps) {
  const { uploadPhoto } = useUpload();
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFiles(files: File[], projectId: string | null) {
    if (!files.length) return;

    const entries: UploadResult[] = files.map((f) => ({
      id: uploadId(),
      name: f.name,
      status: 'uploading',
    }));
    setResults(entries);
    openDrawer();

    const updates = await Promise.all(
      files.map(async (file, i): Promise<UploadResult> => {
        const entry = entries[i] ?? {
          id: uploadId(),
          name: file.name,
          status: 'uploading',
        };
        const { id, name } = entry;
        try {
          const photo = await uploadPhoto(file, projectId);
          return {
            id,
            name,
            status: photo.hasGps ? 'success' : 'no-gps',
            detail: photo.hasGps ? null : 'No GPS data — pin not shown on map',
          };
        } catch (err) {
          if (err instanceof DuplicatePhotoError)
            return { id, name, status: 'duplicate', detail: 'Already uploaded' };
          return { id, name, status: 'error', detail: (err as Error).message };
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

  function handleFiles(fileList: FileList | null) {
    // Copy the files out now: the FileList belongs to the input, and clearing the input
    // (so the same file can be picked again) empties it in Chrome.
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    if (activeProjectId) {
      void processFiles(files, activeProjectId);
    } else {
      setPendingFiles(files);
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function onClick() {
    inputRef.current?.click();
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    e.target.value = '';
  }

  function handleModalConfirm(projectId: string | null) {
    const files = pendingFiles;
    setPendingFiles(null);
    if (files) void processFiles(files, projectId);
  }

  function handleModalSkip() {
    const files = pendingFiles;
    setPendingFiles(null);
    if (files) void processFiles(files, null);
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
