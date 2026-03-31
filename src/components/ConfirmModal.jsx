import { useFocusTrap } from '../hooks/useFocusTrap.js'

export function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onCancel, danger = true }) {
  const trapRef = useFocusTrap(true)

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal-box" ref={trapRef} onClick={e => e.stopPropagation()}>
        <p className="confirm-modal-title">{title}</p>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button className="confirm-modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            className={danger ? 'confirm-modal-delete' : 'confirm-modal-confirm'}
            onClick={onConfirm}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
