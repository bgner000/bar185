import { useEffect, useState } from 'react'

const HIGHLIGHT_DURATION_MS = 4000
const POLL_INTERVAL_MS = 100
const POLL_TIMEOUT_MS = 8000

// Shared "deep link -> scroll -> highlight" behaviour for every admin list
// (bookings, large-group requests, event enquiries, and any future
// notification-driven list): give it the identifier a notification is
// currently asking to focus (or '' for none), tag each card in your list
// with `data-focus-id={theSameKindOfIdentifier}`, and spread
// `cardProps(identifier)` onto it.
//
// The target card often isn't in the DOM yet when `active` first changes
// (the caller's own data fetch -- by date, by reference, whatever -- is
// still in flight), so this polls briefly rather than looking up the node
// just once. It's a plain `[active]`-keyed effect with a real cleanup
// (clearTimeout, cancelled flag) -- deliberately not a dependency-less
// effect that re-runs on every unrelated render.
export function useFocusedCard(active) {
  const [highlighted, setHighlighted] = useState('')

  useEffect(() => {
    if (!active) {
      setHighlighted('')
      return undefined
    }

    let cancelled = false
    let timeoutId = null
    const startedAt = Date.now()

    function tryFind() {
      if (cancelled) return

      const node = document.querySelector(`[data-focus-id="${CSS.escape(active)}"]`)

      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlighted(active)
        return
      }

      if (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        timeoutId = setTimeout(tryFind, POLL_INTERVAL_MS)
      }
    }

    tryFind()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [active])

  useEffect(() => {
    if (!highlighted) return undefined

    const timer = setTimeout(() => {
      setHighlighted((current) => (current === highlighted ? '' : current))
    }, HIGHLIGHT_DURATION_MS)

    return () => clearTimeout(timer)
  }, [highlighted])

  return {
    isFocused: (identifier) => Boolean(identifier) && highlighted === identifier,
  }
}
