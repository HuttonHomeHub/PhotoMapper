import { useState, useCallback, useRef } from 'react'

let _addToast = null

export function useToast() {
  return { toast: (msg, type = 'info', duration = 3500) => _addToast?.(msg, type, duration) }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)

  _addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++counterRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  if (!toasts.length) return null

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-message">{t.message}</span>
          <button
            className="toast-close"
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            aria-label="Dismiss"
          >×</button>
        </div>
      ))}
    </div>
  )
}
