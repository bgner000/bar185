import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../lib/format'

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6v4.2l2.8 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A compact time-picker: click the display to open a dropdown of the real
// available start times for the selected date, or step through them with
// the stacked up/down arrows. Only slots with seats remaining are ever
// offered, so a selection always maps to a real, currently-bookable
// booking_slot_id.
function TimePicker({ dateKey, slots, selectedSlotId, onSelectSlot }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const availableSlots = (slots || []).filter(
    (slot) => slot.total_capacity - slot.reserved_capacity > 0
  )

  const selectedIndex = availableSlots.findIndex(
    (slot) => String(slot.id) === String(selectedSlotId)
  )

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!dateKey) {
    return <p className="field-hint">Choose a date above to see available times.</p>
  }

  if (availableSlots.length === 0) {
    return <p className="field-hint">No available times left for this date — please choose another date.</p>
  }

  const goToNext = () => {
    const nextIndex = selectedIndex === -1 ? 0 : selectedIndex + 1
    if (nextIndex < availableSlots.length) onSelectSlot(availableSlots[nextIndex].id)
  }

  const goToPrevious = () => {
    if (selectedIndex > 0) onSelectSlot(availableSlots[selectedIndex - 1].id)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      goToNext()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      goToPrevious()
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const selectedSlot = selectedIndex >= 0 ? availableSlots[selectedIndex] : null

  return (
    <div className="time-picker" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="time-picker-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ClockIcon />
        <span>{selectedSlot ? formatTime(selectedSlot.starts_at) : 'Select a time'}</span>
      </button>

      <div className="time-picker-steppers">
        <button
          type="button"
          className="time-picker-step"
          aria-label="Next available time"
          disabled={selectedIndex === availableSlots.length - 1}
          onClick={goToNext}
        >
          <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
            <path d="M1 5l4-4 4 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="time-picker-step"
          aria-label="Previous available time"
          disabled={selectedIndex <= 0}
          onClick={goToPrevious}
        >
          <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <ul className="time-picker-menu" role="listbox">
          {availableSlots.map((slot) => {
            const seats = slot.total_capacity - slot.reserved_capacity
            const isSelected = String(slot.id) === String(selectedSlotId)

            return (
              <li key={slot.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`time-picker-option${isSelected ? ' selected' : ''}`}
                  onClick={() => {
                    onSelectSlot(slot.id)
                    setOpen(false)
                  }}
                >
                  <span>{formatTime(slot.starts_at)}</span>
                  <span className="time-picker-option-seats">{seats} seats</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default TimePicker
