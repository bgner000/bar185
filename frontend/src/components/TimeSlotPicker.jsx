import { formatDateKeyLong, formatTime } from '../lib/format'

function TimeSlotPicker({ dateKey, slots, selectedSlotId, onSelectSlot }) {
  if (!dateKey) {
    return <p className="field-hint">Choose a date above to see available times.</p>
  }

  if (!slots || slots.length === 0) {
    return <p className="field-hint">No booking times are available on this date.</p>
  }

  return (
    <div className="time-slot-picker">
      <span className="time-slot-picker-date">{formatDateKeyLong(dateKey)}</span>

      <div className="time-slot-chips">
        {slots.map((slot) => {
          const seats = slot.total_capacity - slot.reserved_capacity
          const isFull = seats <= 0
          const isSelected = String(slot.id) === String(selectedSlotId)

          return (
            <button
              key={slot.id}
              type="button"
              className={`time-chip${isSelected ? ' selected' : ''}${isFull ? ' full' : ''}`}
              disabled={isFull}
              onClick={() => onSelectSlot(slot.id)}
            >
              <span className="time-chip-time">{formatTime(slot.starts_at)}</span>
              <span className="time-chip-seats">{isFull ? 'Full' : `${seats} seats`}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default TimeSlotPicker
