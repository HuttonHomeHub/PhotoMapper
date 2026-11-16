import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@hhh/ui';
import type { BackupsReply, InstanceInfoReply, RestoreReply } from '../../shared/api.ts';

// The Settings panel's data: how this instance is set up (/api/info) and its backups
// (/api/backup). Loaded when the panel opens; every action reloads both.
export function useSettings(open: boolean) {
  const [info, setInfo] = useState<InstanceInfoReply | null>(null);
  const [backups, setBackups] = useState<BackupsReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Loads both, and reports the result only while `isCurrent()` (state is set on arrival).
  const load = useCallback(
    (isCurrent: () => boolean) =>
      Promise.all([
        apiFetch<InstanceInfoReply>('/api/info'),
        apiFetch<BackupsReply>('/api/backup'),
      ]).then(
        ([nextInfo, nextBackups]) => {
          if (!isCurrent()) return;
          setInfo(nextInfo);
          setBackups(nextBackups);
          setError(null);
        },
        (err: unknown) => {
          if (isCurrent()) setError((err as Error).message);
        }
      ),
    []
  );
  const refresh = useCallback(() => load(() => true), [load]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [open, load]);

  const backupNow = useCallback(async () => {
    await apiFetch('/api/backup', { method: 'POST' });
    await refresh();
  }, [refresh]);

  const restore = useCallback(
    async (name: string) => {
      const result = await apiFetch<RestoreReply>('/api/backup/restore', {
        method: 'POST',
        body: { name },
      });
      await refresh();
      return result;
    },
    [refresh]
  );

  const uploadRestore = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const result = await apiFetch<RestoreReply>('/api/backup/restore', {
        method: 'POST',
        body: form,
      });
      await refresh();
      return result;
    },
    [refresh]
  );

  return { info, backups, error, backupNow, restore, uploadRestore };
}

/** The running version for the app bar (`dev` until it loads). */
export function useAppVersion() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    apiFetch<{ version: string }>('/version')
      .then((v) => setVersion(v.version))
      .catch(() => setVersion(''));
  }, []);
  return version;
}
