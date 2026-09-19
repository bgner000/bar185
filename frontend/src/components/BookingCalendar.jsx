import { useState } from 'react'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABEL_FORMAT = { month: 'long', year: 'numeric', timeZone: 'UTC' }
const DAY_LABEL_FORMAT = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }

function pad(value) {
  return String(value).padStart(2, '0')
}

function daysInMonth(year, month) {
  // month is 1-12; day 0 of the next month rolls back to the last day of this one
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function firstWeekday(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

function shiftMonth(year, month, delta) {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

function BookingCalendar({ availability, selectedDate, onSelectDate, todayKey }) {
  const initial = selectedDate ?? todayKey
  const [initYear, initMonth] = initial.split('-').map(Number)
  const [view, setView] = useState({ year: initYear, month: initMonth })

  const monthLabel = new Date(Date.UTC(view.year, view.month - 1, 1)).toLocaleDateString(
    'en-AU',
    MONTH_LABEL_FORMAT
  )

  const leadingBlanks = firstWeekday(view.year, view.month)
  const totalDays = daysInMonth(view.year, view.month)
  const cells = [...Array(leadingBlanks).fill(null), ...Array(totalDays)].map((_, index) =>
    index < leadingBlanks ? null : index - leadingBlanks + 1
  )

  const canGoBack = `${view.year}-${pad(view.month)}` > todayKey.slice(0, 7)

  return (
    <div className="booking-calendar" role="group" aria-label="Choose a date">
      <div className="booking-calendar-head">
        <button
          type="button"
          className="calendar-nav-btn"
          disabled={!canGoBack}
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        {/* aria-live: a screen-reader user who just pressed Previous/Next
            month hears the new month, the same way a sighted user sees it
            update -- without this, that change is silent. */}
        <span aria-live="polite">{monthLabel}</span>
        <button
          type="button"
          className="calendar-nav-btn"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="booking-calendar-grid booking-calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="booking-calendar-grid">
        {cells.map((day, index) => {
          if (day === null) {
            return <span key={`blank-${index}`} className="calendar-day calendar-day-blank" />
          }

          const dateKey = `${view.year}-${pad(view.month)}-${pad(day)}`
          const isPast = dateKey < todayKey
          const hasAvailability = availability.get(dateKey)?.hasAvailability
          const isSelected = dateKey === selectedDate
          const disabled = isPast || !hasAvailability
          const fullDateLabel = new Date(Date.UTC(view.year, view.month - 1, day)).toLocaleDateString(
            'en-AU',
            DAY_LABEL_FORMAT
          )
          const availabilityLabel = isPast ? 'past' : hasAvailability ? 'available' : 'fully booked'

          return (
            <button
              key={dateKey}
              type="button"
              className={`calendar-day${isSelected ? ' selected' : ''}${
                disabled ? ' disabled' : ''
              }`}
              disabled={disabled}
              onClick={() => onSelectDate(dateKey)}
              aria-pressed={isSelected}
              aria-label={`${fullDateLabel}${disabled ? `, ${availabilityLabel}` : ''}`}
            >
              {day}
              {hasAvailability && !isPast && <span className="calendar-day-dot" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default BookingCalendar
