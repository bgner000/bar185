import { useId, useState } from 'react'
import { useModalFocus } from '../lib/useModalFocus'

// A single reusable confirmation modal for every dangerous/important admin
// action (approve, decline, admin cancel, mark no-show, replace menu, ...),
// so they all look and behave the same rather than mixing native confirm()
// with one-off custom dialogs. The parent only renders this component while
// there's something to confirm (e.g. `{target && <ConfirmDialog .../>}`),
// so mounting it fresh each time is what resets its internal state — no
// effect-based reset needed.
//
// Keyboard behaviour (focus moved in on open, Tab trapped, Escape closes,
// focus returned to the trigger on close) lives in useModalFocus, shared
// with the Events edit dialog.
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

  const baseId = useId()
  const titleId = `${baseId}-title`
  const descriptionId = `${baseId}-description`
  const reasonId = `${baseId}-reason`
  const errorId = `${baseId}-error`

  const panelRef = useModalFocus({ onEscape: onClose, locked: submitting })

  const handleConfirm = async () => {
    if (showReason && reasonRequired && !reason.trim()) {
      setError(`${reasonLabel.replace(/\s*\(.*\)\s*$/, '')} is required. Enter a reason before continuing.`)
      document.getElementById(reasonId)?.focus()
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

  const reasonHasError = Boolean(error) && showReason && reasonRequired && !reason.trim()

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Close dialog"
            disabled={submitting}
            onClick={onClose}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {description && (
          <p id={descriptionId} className="modal-description">
            {description}
          </p>
        )}
        {children}

        {showReason && (
          <div className="field modal-reason-field">
            <label htmlFor={reasonId}>{reasonLabel}</label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
              placeholder={reasonPlaceholder}
              required={reasonRequired}
              aria-invalid={reasonHasError || undefined}
              aria-describedby={reasonHasError ? errorId : undefined}
              rows={3}
            />
          </div>
        )}

        {error && (
          <div id={errorId} className="alert alert-error modal-error" role="alert">
            <p>
              <strong>Error: </strong>
              {error}
            </p>
          </div>
        )}

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
