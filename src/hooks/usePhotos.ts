import { useCallback } from 'react';
import { useApiList } from './useApiList.ts';
import { apiFetch } from '@hhh/ui';
import type { Photo } from '../../shared/api.ts';

/** The fields a photo edit can change. */
export interface PhotoEdit {
  description?: string | null;
  tags?: string[];
  projectId?: string | null;
  surveyDate?: string | null;
}

// ARCH-06: photo state + operations. Split out of the former 25-return
// kitchen-sink hook (see useClients.ts / useProjects.ts for the rest).
export function usePhotos() {
  const {
    items: photos,
    setItems: setPhotos,
    loading,
    error,
    refresh,
  } = useApiList<Photo>('/api/photos');

  const deletePhoto = useCallback(
    async (id: string) => {
      await apiFetch(`/api/photos/${id}`, { method: 'DELETE' });
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    },
    [setPhotos]
  );

  const updatePhoto = useCallback(
    async (id: string, fields: PhotoEdit) => {
      const updated = await apiFetch<Photo>(`/api/photos/${id}`, { method: 'PATCH', body: fields });
      setPhotos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    },
    [setPhotos]
  );

  // FEAT: manually place (or reposition) a photo's pin on the map.
  const setPhotoLocation = useCallback(
    async (id: string, lat: number, lng: number) => {
      const updated = await apiFetch<Photo>(`/api/photos/${id}/location`, {
        method: 'PUT',
        body: { lat, lng },
      });
      setPhotos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    },
    [setPhotos]
  );

  // FEAT: remove a hand-placed pin, returning the photo to "No GPS".
  const clearPhotoLocation = useCallback(
    async (id: string) => {
      const updated = await apiFetch<Photo>(`/api/photos/${id}/location`, { method: 'DELETE' });
      setPhotos((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    },
    [setPhotos]
  );

  const exportPhotos = useCallback((format: 'geojson' | 'kml' = 'geojson') => {
    const a = document.createElement('a');
    a.href = `/api/photos/export?format=${format}`;
    a.download = `photos.${format}`;
    a.click();
  }, []);

  const updatePhotoSurveyDate = useCallback(
    (id: string, surveyDate: string | null) => updatePhoto(id, { surveyDate }),
    [updatePhoto]
  );
  const updatePhotoProject = useCallback(
    (id: string, projectId: string | null) => updatePhoto(id, { projectId }),
    [updatePhoto]
  );

  const batchUpdate = useCallback(
    async (
      ids: string[],
      {
        tags,
        description,
        mergeTags,
      }: { tags?: string[]; description?: string | null; mergeTags?: boolean }
    ) => {
      await apiFetch('/api/photos/batch', {
        method: 'PATCH',
        body: { ids, tags, description, mergeTags },
      });
      await refresh();
    },
    [refresh]
  );

  const batchDelete = useCallback(
    async (ids: string[]) => {
      // Callers don't wait for the result: whatever failed, the refresh shows what's left.
      await Promise.allSettled(
        ids.map((id) => apiFetch(`/api/photos/${id}`, { method: 'DELETE' }))
      );
      await refresh();
    },
    [refresh]
  );

  return {
    photos,
    loading,
    error,
    refresh,
    deletePhoto,
    updatePhoto,
    setPhotoLocation,
    clearPhotoLocation,
    exportPhotos,
    updatePhotoSurveyDate,
    updatePhotoProject,
    batchUpdate,
    batchDelete,
  };
}
