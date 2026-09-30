import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Shared keyboard behaviour for every admin modal (ConfirmDialog, the Events
// edit dialog): on open, move focus into the dialog; while open, keep Tab /
// Shift+Tab inside it and let Escape close it (unless `locked`, e.g. while a
// save is in flight); on close, return focus to whatever opened it so a
// keyboard user never loses their place in the list underneath.
//
// `initialFocusSelector` lets a form dialog put focus straight on its first
// field; otherwise the panel itself (tabIndex -1) receives focus so a screen
// reader announces the dialog's label first.
export function useModalFocus({ onEscape, locked = false, initialFocusSelector } = {}) {
  const panelRef = useRef(null)
  const onEscapeRef = useRef(onEscape)
  const lockedRef = useRef(locked)

  useEffect(() => {
    onEscapeRef.current = onEscape
    lockedRef.current = locked
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined

    const previouslyFocused = document.activeElement
    const initial = initialFocusSelector ? panel.querySelector(initialFocusSelector) : null
    ;(initial || panel).focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!lockedRef.current && onEscapeRef.current) {
          event.stopPropagation()
          onEscapeRef.current()
        }
        return
      }

      if (event.key !== 'Tab') return

      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // The trigger may have been re-rendered away (e.g. a booking that
      // changed status loses its "Cancel booking" button); only restore
      // focus if it's still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
    // Mount/unmount only -- the callers render the modal only while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return panelRef
}
