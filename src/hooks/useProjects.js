import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@hhh/ui';

const postJson = (url, method, body) => apiFetch(url, { method, body });

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
      setProjects(await apiFetch('/api/projects'));
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
      // Callers don't wait for the result: if the delete failed, re-read the list.
      try {
        await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
        setProjects((prev) => prev.filter((p) => p.id !== id));
      } catch {
        await refresh();
      }
      // photos' project_id was set NULL by the ON DELETE SET NULL FK
      await onPhotosChanged?.();
    },
    [onPhotosChanged, refresh]
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
    await apiFetch(`/api/projects/${id}/share`, { method: 'DELETE' });
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
