import { useState } from 'react'

// A single reusable confirmation modal for every dangerous/important admin
// action (approve, decline, admin cancel, mark no-show, replace menu, ...),
// so they all look and behave the same rather than mixing native confirm()
// with one-off custom dialogs. The parent only renders this component while
// there's something to confirm (e.g. `{target && <ConfirmDialog .../>}`),
// so mounting it fresh each time is what resets its internal state — no
// effect-based reset needed.
function ConfirmDialog({
  title,
  description,
  children,
  showReason = false,
  reasonRequired = false,
  reasonLabel = 'Reason',
  reasonPlaceholder,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (showReason && reasonRequired && !reason.trim()) {
      setError('A reason is required.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await onConfirm(reason.trim())
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const handleOverlayKeyDown = (event) => {
    if (event.key === 'Escape' && !submitting) onClose()
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => !submitting && onClose()}
      onKeyDown={handleOverlayKeyDown}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{title}</h3>
        {description && <p className="modal-description">{description}</p>}
        {children}

        {showReason && (
          <div className="field modal-reason-field">
            <label htmlFor="confirm-dialog-reason">{reasonLabel}</label>
            <textarea
              id="confirm-dialog-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
              placeholder={reasonPlaceholder}
              rows={3}
            />
          </div>
        )}

        {error && <div className="alert alert-error modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
