import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@hhh/ui';

const postJson = (url, method, body) => apiFetch(url, { method, body });

// ARCH-06: client state + operations (split out of the old usePhotos).
export function useClients() {
  const [clients, setClients] = useState([]);
  // FE-06: expose loading/error so the panel can show real states instead of a
  // misleading "no clients yet" while the first fetch is still in flight.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setClients(await apiFetch('/api/clients'));
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

  const createClient = useCallback(async (data) => {
    const client = await postJson('/api/clients', 'POST', data);
    setClients((prev) => [...prev, client]);
    return client;
  }, []);

  const updateClient = useCallback(async (id, changes) => {
    const updated = await postJson(`/api/clients/${id}`, 'PATCH', changes);
    setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  // Callers don't wait for the result: if the delete failed, re-read the list.
  const deleteClient = useCallback(
    async (id) => {
      try {
        await apiFetch(`/api/clients/${id}`, { method: 'DELETE' });
        setClients((prev) => prev.filter((c) => c.id !== id));
      } catch {
        await refresh();
      }
    },
    [refresh]
  );

  return { clients, loading, error, refresh, createClient, updateClient, deleteClient };
}
