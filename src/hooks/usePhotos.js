import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@hhh/ui';

// ARCH-06: photo state + operations. Split out of the former 25-return
// kitchen-sink hook (see useClients.js / useProjects.js for the rest).
export function usePhotos() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPhotos(await apiFetch('/api/photos'));
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

  const deletePhoto = useCallback(async (id) => {
    await apiFetch(`/api/photos/${id}`, { method: 'DELETE' });
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePhoto = useCallback(async (id, fields) => {
    const updated = await apiFetch(`/api/photos/${id}`, { method: 'PATCH', body: fields });
    setPhotos((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  // FEAT: manually place (or reposition) a photo's pin on the map.
  const setPhotoLocation = useCallback(async (id, lat, lng) => {
    const updated = await apiFetch(`/api/photos/${id}/location`, {
      method: 'PUT',
      body: { lat, lng },
    });
    setPhotos((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  // FEAT: remove a hand-placed pin, returning the photo to "No GPS".
  const clearPhotoLocation = useCallback(async (id) => {
    const updated = await apiFetch(`/api/photos/${id}/location`, { method: 'DELETE' });
    setPhotos((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const exportPhotos = useCallback((format = 'geojson') => {
    const a = document.createElement('a');
    a.href = `/api/photos/export?format=${format}`;
    a.download = `photos.${format}`;
    a.click();
  }, []);

  const updatePhotoSurveyDate = useCallback(
    (id, surveyDate) => updatePhoto(id, { surveyDate }),
    [updatePhoto]
  );
  const updatePhotoProject = useCallback(
    (id, projectId) => updatePhoto(id, { projectId }),
    [updatePhoto]
  );

  const batchUpdate = useCallback(
    async (ids, { tags, description, mergeTags }) => {
      await apiFetch('/api/photos/batch', {
        method: 'PATCH',
        body: { ids, tags, description, mergeTags },
      });
      await refresh();
    },
    [refresh]
  );

  const batchDelete = useCallback(
    async (ids) => {
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
