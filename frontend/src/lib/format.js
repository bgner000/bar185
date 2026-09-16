const SYDNEY_TZ = 'Australia/Sydney'

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
