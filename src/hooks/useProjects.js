import { useState, useEffect, useCallback } from 'react';

async function postJson(url, method, data) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ARCH-06: project state + operations (split out of the old usePhotos).
// Project mutations that also change photos (delete, (re)assign) call
// `onPhotosChanged` so the photo list can refresh its project_id links.
export function useProjects({ onPhotosChanged } = {}) {
  const [projects, setProjects] = useState([]);
  // FE-06: loading/error for the navigation panel (see useClients).
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProjects(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(async (data) => {
    const project = await postJson('/api/projects', 'POST', data);
    setProjects((prev) => [project, ...prev]);
    return project;
  }, []);

  const updateProject = useCallback(async (id, changes) => {
    const updated = await postJson(`/api/projects/${id}`, 'PATCH', changes);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const deleteProject = useCallback(
    async (id) => {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== id));
      // photos' project_id was set NULL by the ON DELETE SET NULL FK
      await onPhotosChanged?.();
    },
    [onPhotosChanged]
  );

  const assignToProject = useCallback(
    async (projectId, photoIds) => {
      await postJson(`/api/projects/${projectId}/photos`, 'PATCH', { photoIds });
      await onPhotosChanged?.();
      await refresh(); // project photo counts changed
    },
    [onPhotosChanged, refresh]
  );

  // FEAT: enable a public read-only share link. Returns the (stable) token.
  const enableShare = useCallback(async (id) => {
    const { shareToken } = await postJson(`/api/projects/${id}/share`, 'POST');
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, shareToken } : p)));
    return shareToken;
  }, []);

  // FEAT: revoke the share link (the old URL stops working immediately).
  const disableShare = useCallback(async (id) => {
    const res = await fetch(`/api/projects/${id}/share`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, shareToken: null } : p)));
  }, []);

  return {
    projects,
    loading,
    error,
    refresh,
    createProject,
    updateProject,
    deleteProject,
    assignToProject,
    enableShare,
    disableShare,
  };
}
