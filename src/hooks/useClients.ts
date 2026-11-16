import { useCallback } from 'react';
import { apiFetch, type ApiOptions } from '@hhh/ui';
import type { Client } from '../../shared/api.ts';
import { useApiList } from './useApiList.ts';

const postJson = <R>(url: string, method: NonNullable<ApiOptions['method']>, body?: unknown) =>
  apiFetch<R>(url, { method, body });

// ARCH-06: client state + operations (split out of the old usePhotos).
export function useClients() {
  const {
    items: clients,
    setItems: setClients,
    loading,
    error,
    refresh,
  } = useApiList<Client>('/api/clients');

  const createClient = useCallback(
    async (data: { name: string }) => {
      const client = await postJson<Client>('/api/clients', 'POST', data);
      setClients((prev) => [...prev, client]);
      return client;
    },
    [setClients]
  );

  const updateClient = useCallback(
    async (id: string, changes: { name: string }) => {
      const updated = await postJson<Client>(`/api/clients/${id}`, 'PATCH', changes);
      setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
    },
    [setClients]
  );

  // Callers don't wait for the result: if the delete failed, re-read the list.
  const deleteClient = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/clients/${id}`, { method: 'DELETE' });
        setClients((prev) => prev.filter((c) => c.id !== id));
      } catch {
        await refresh();
      }
    },
    [refresh, setClients]
  );

  return { clients, loading, error, refresh, createClient, updateClient, deleteClient };
}
