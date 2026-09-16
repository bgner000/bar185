const SYDNEY_TZ = 'Australia/Sydney'

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

// Formats a plain "HH:MM:SS" opening/closing time (already Sydney wall-clock,
// as stored in venue_hours) as compact copy like "4pm" or "11:30pm", with
// midnight shown as "Midnight" rather than "12am".
export function formatHourLabel(timeString) {
  if (!timeString) return ''

  const [hourStr, minuteStr] = timeString.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)

  if (hour === 0 && minute === 0) return 'Midnight'

  const period = hour < 12 ? 'am' : 'pm'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12

  return minute === 0 ? `${hour12}${period}` : `${hour12}:${String(minute).padStart(2, '0')}${period}`
}

export function weekdayName(dayOfWeek) {
  return WEEKDAY_NAMES[dayOfWeek] || ''
}

export function formatDateTime(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString('en-AU', {
    timeZone: SYDNEY_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(value) {
  if (!value) return '—'

  return new Date(value).toLocaleDateString('en-AU', {
    timeZone: SYDNEY_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(value) {
  if (!value) return '—'

  return new Date(value).toLocaleTimeString('en-AU', {
    timeZone: SYDNEY_TZ,
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Returns the Sydney-local calendar date as 'YYYY-MM-DD', independent of the
// viewer's own timezone. Used to group booking slots by the day staff/
// customers actually mean, not the UTC day the timestamp happens to fall on.
export function sydneyDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function todaySydneyDateKey() {
  return sydneyDateKey(new Date())
}

export function formatDateKeyLong(dateKey) {
  if (!dateKey) return ''

  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function formatDateKeyFull(dateKey) {
  if (!dateKey) return ''

  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Pure date-key arithmetic (no timezone involved — dateKey is already a
// plain Sydney-local 'YYYY-MM-DD', so this just walks the calendar).
export function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))

  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(value)
}

const STATUS_LABELS = {
  new: 'New',
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
  seated: 'Seated',
  acknowledged: 'Acknowledged',
  in_review: 'In Review',
  contacted: 'Contacted',
  quoted: 'Quoted',
  closed: 'Closed',
}

const STATUS_TONES = {
  new: 'info',
  pending: 'warning',
  confirmed: 'success',
  declined: 'danger',
  cancelled: 'danger',
  completed: 'neutral',
  no_show: 'neutral',
  seated: 'success',
  acknowledged: 'info',
  in_review: 'warning',
  contacted: 'info',
  quoted: 'success',
  closed: 'neutral',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

export function statusTone(status) {
  return STATUS_TONES[status] || 'neutral'
}
