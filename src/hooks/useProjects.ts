import { useCallback } from 'react';
import { apiFetch, type ApiOptions } from '@hhh/ui';
import type { Project } from '../../shared/api.ts';
import { useApiList } from './useApiList.ts';

const postJson = <R>(url: string, method: NonNullable<ApiOptions['method']>, body?: unknown) =>
  apiFetch<R>(url, { method, body });

// ARCH-06: project state + operations (split out of the old usePhotos).
// Project mutations that also change photos (delete, (re)assign) call
// `onPhotosChanged` so the photo list can refresh its project_id links.
export interface ProjectInput {
  name: string;
  clientId?: string | null;
  status?: 'active' | 'archived';
  color?: string;
}

export function useProjects({ onPhotosChanged }: { onPhotosChanged?: () => unknown } = {}) {
  const {
    items: projects,
    setItems: setProjects,
    loading,
    error,
    refresh,
  } = useApiList<Project>('/api/projects');

  const createProject = useCallback(
    async (data: ProjectInput) => {
      const project = await postJson<Project>('/api/projects', 'POST', data);
      setProjects((prev) => [project, ...prev]);
      return project;
    },
    [setProjects]
  );

  const updateProject = useCallback(
    async (id: string, changes: Partial<ProjectInput>) => {
      const updated = await postJson<Project>(`/api/projects/${id}`, 'PATCH', changes);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    },
    [setProjects]
  );

  const deleteProject = useCallback(
    async (id: string) => {
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
    [onPhotosChanged, refresh, setProjects]
  );

  const assignToProject = useCallback(
    async (projectId: string, photoIds: string[]) => {
      await postJson(`/api/projects/${projectId}/photos`, 'PATCH', { photoIds });
      await onPhotosChanged?.();
      await refresh(); // project photo counts changed
    },
    [onPhotosChanged, refresh]
  );

  // FEAT: enable a public read-only share link. Returns the (stable) token.
  const enableShare = useCallback(
    async (id: string) => {
      const { shareToken } = await postJson<{ shareToken: string }>(
        `/api/projects/${id}/share`,
        'POST'
      );
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, shareToken } : p)));
      return shareToken;
    },
    [setProjects]
  );

  // FEAT: revoke the share link (the old URL stops working immediately).
  const disableShare = useCallback(
    async (id: string) => {
      await apiFetch(`/api/projects/${id}/share`, { method: 'DELETE' });
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, shareToken: null } : p)));
    },
    [setProjects]
  );

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
