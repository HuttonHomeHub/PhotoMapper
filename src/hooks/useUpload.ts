import { useMemo } from 'react';
import { ApiError, apiFetch } from '@hhh/ui';
import type { Client, Photo, Project } from '../../shared/api.ts';

/** Thrown when the server already has a photo with the same content (409). */
export class DuplicatePhotoError extends Error {
  constructor() {
    super('Already uploaded');
    this.name = 'DuplicatePhotoError';
  }
}

// PERF-07: no client-side hashing/pre-check — the server dedupes by content hash
// (unique index) and returns 409 for duplicates. This avoids reading the whole file
// into memory in the browser and an extra round-trip.
async function uploadPhoto(file: File, projectId: string | null): Promise<Photo> {
  const formData = new FormData();
  formData.append('photo', file);
  if (projectId) formData.append('projectId', projectId);
  try {
    return await apiFetch<Photo>('/api/photos', { method: 'POST', body: formData });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) throw new DuplicatePhotoError();
    throw err;
  }
}

/** The upload dialog's "new client" path: a client, and optionally its first project. */
async function createClientWithProject(
  clientName: string,
  projectName: string
): Promise<string | null> {
  const client = await apiFetch<Client>('/api/clients', {
    method: 'POST',
    body: { name: clientName },
  });
  if (!projectName) return null;
  const project = await apiFetch<Project>('/api/projects', {
    method: 'POST',
    body: { name: projectName, clientId: client.id, status: 'active', color: '#3a86ff' },
  });
  return project.id;
}

export function useUpload() {
  return useMemo(() => ({ uploadPhoto, createClientWithProject }), []);
}
