import { useState, useEffect, useCallback } from 'react';

// ARCH-06: photo state + operations. Split out of the former 25-return
// kitchen-sink hook (see useClients.js / useProjects.js for the rest).
export function usePhotos() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/photos');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhotos(await res.json());
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
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePhoto = useCallback(async (id, fields) => {
    const res = await fetch(`/api/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const updated = await res.json();
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
      const res = await fetch('/api/photos/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, tags, description, mergeTags }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await refresh();
    },
    [refresh]
  );

  const batchDelete = useCallback(
    async (ids) => {
      await Promise.all(ids.map((id) => fetch(`/api/photos/${id}`, { method: 'DELETE' })));
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
    exportPhotos,
    updatePhotoSurveyDate,
    updatePhotoProject,
    batchUpdate,
    batchDelete,
  };
}
