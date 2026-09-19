import { useEffect, useRef, useState } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
  const panelRef = useRef(null)

  // Moves keyboard/screen-reader focus into the dialog the moment it
  // appears (nothing does this by default -- without it, focus silently
  // stays on the trigger button underneath the now-open overlay) and traps
  // Tab/Shift+Tab within it while it's open, so a keyboard user can never
  // tab into the page content the overlay is visually blocking.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined

    panel.focus()

    const handleTrapTab = (event) => {
      if (event.key !== 'Tab') return

      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    panel.addEventListener('keydown', handleTrapTab)
    return () => panel.removeEventListener('keydown', handleTrapTab)
  }, [])

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
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
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

        {error && (
          <div className="alert alert-error modal-error" role="alert">
            {error}
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
