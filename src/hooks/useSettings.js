import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@hhh/ui';

// The Settings panel's data: how this instance is set up (/api/info) and its backups
// (/api/backup). Loaded when the panel opens; every action reloads both.
export function useSettings(open) {
  const [info, setInfo] = useState(null);
  const [backups, setBackups] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [nextInfo, nextBackups] = await Promise.all([
        apiFetch('/api/info'),
        apiFetch('/api/backup'),
      ]);
      setInfo(nextInfo);
      setBackups(nextBackups);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const backupNow = useCallback(async () => {
    await apiFetch('/api/backup', { method: 'POST' });
    await refresh();
  }, [refresh]);

  const restore = useCallback(
    async (name) => {
      const result = await apiFetch('/api/backup/restore', { method: 'POST', body: { name } });
      await refresh();
      return result;
    },
    [refresh]
  );

  const uploadRestore = useCallback(
    async (file) => {
      const form = new FormData();
      form.append('file', file);
      const result = await apiFetch('/api/backup/restore', { method: 'POST', body: form });
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
    apiFetch('/version')
      .then((v) => setVersion(v.version))
      .catch(() => setVersion(''));
  }, []);
  return version;
}
