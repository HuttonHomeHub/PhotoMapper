import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@hhh/ui';
import type { Share } from '../../shared/api.ts';

export type ShareState =
  | { status: 'loading' }
  | { status: 'ok'; share: Share }
  | { status: 'notfound' }
  | { status: 'error' };

// FEAT: the public, read-only share behind /share/:token. Uses only the public endpoint.
export function useShare(token: string): ShareState {
  const [state, setState] = useState<{ token: string; value: ShareState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Share>(`/api/public/share/${encodeURIComponent(token)}`)
      .then((share) => {
        if (!cancelled) setState({ token, value: { status: 'ok', share } });
      })
      .catch((err: unknown) => {
        const value: ShareState =
          err instanceof ApiError && err.status === 404
            ? { status: 'notfound' }
            : { status: 'error' };
        if (!cancelled) setState({ token, value });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // A new token shows "loading" until its own answer arrives.
  return state && state.token === token ? state.value : { status: 'loading' };
}
