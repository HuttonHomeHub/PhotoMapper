import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { apiFetch } from '@hhh/ui';

export interface ApiList<T> {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  loading: boolean;
  error: string | null;
  /** Reloads the list (it shows as loading meanwhile). */
  refresh: () => Promise<void>;
}

/** A list the API returns at `path`, loaded on mount (ARCH-06's shared shape). */
export function useApiList<T>(path: string): ApiList<T> {
  const [items, setItems] = useState<T[]>([]);
  // FE-06: loading/error so panels can show real states instead of a misleading empty list.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(async (request: Promise<T[]>, isCurrent: () => boolean) => {
    try {
      const next = await request;
      if (!isCurrent()) return;
      setItems(next);
      setError(null);
    } catch (err) {
      if (isCurrent()) setError((err as Error).message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await apply(apiFetch<T[]>(path), () => true);
  }, [apply, path]);

  // Loads on mount (or a new path); state is only set when the answer arrives.
  useEffect(() => {
    let current = true;
    apiFetch<T[]>(path)
      .then(
        (next) => {
          if (!current) return;
          setItems(next);
          setError(null);
        },
        (err: unknown) => {
          if (current) setError((err as Error).message);
        }
      )
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [path]);

  return { items, setItems, loading, error, refresh };
}
