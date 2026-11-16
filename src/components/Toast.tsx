import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export type ToastType = 'info' | 'success' | 'error';
export type ShowToast = (message: string, type?: ToastType, duration?: number) => void;

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

// CQ-06: toast notifications via React context (previously a module-level
// `_addToast` global assigned during render — which broke with >1 container and
// wasn't idiomatic). Wrap the app in <ToastProvider> and call useToast().
const ToastContext = createContext<ShowToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const toast = useCallback<ShowToast>((message, type = 'info', duration = 3500) => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const noop: ShowToast = () => {};

export function useToast(): { toast: ShowToast } {
  const toast = useContext(ToastContext);
  // Fall back to a no-op if used outside a provider (e.g. isolated tests).
  return { toast: toast ?? noop };
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon" aria-hidden="true">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'i'}
          </span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
