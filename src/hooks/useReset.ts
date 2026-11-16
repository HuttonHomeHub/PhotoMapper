import { useCallback } from 'react';
import { apiFetch } from '@hhh/ui';

/** DELETE /api/reset: wipes every photo, project and client (only when ALLOW_RESET is on). */
export function useReset(): () => Promise<void> {
  return useCallback(async () => {
    await apiFetch('/api/reset', { method: 'DELETE' });
  }, []);
}
