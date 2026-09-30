import { useEffect, useId, useMemo, useState } from 'react'
import api from '../lib/api'
import ConfirmDialog from '../components/ConfirmDialog'
import StatusBadge from '../components/StatusBadge'
import { Alert, LoadingState, EmptyState } from '../components/Feedback'
import { useFocusedCard } from '../lib/useFocusedCard'
import {
  formatTime,
  formatDateTime,
  formatDateKeyFull,
  todaySydneyDateKey,
  addDaysToDateKey,
  sydneyDateKey,
} from '../lib/format'

const REFRESH_INTERVAL_MS = 30000

const SORT_OPTIONS = [
  { value: 'time-asc', label: 'Booking time ↑' },
  { value: 'time-desc', label: 'Booking time ↓' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'party-desc', label: 'Party size (largest first)' },
  { value: 'party-asc', label: 'Party size (smallest first)' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'confirmed', label: 'Upcoming' },
  { value: 'seated', label: 'Seated' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No-show' },
  { value: 'cancelled', label: 'Cancelled' },
]

function sortBookings(bookings, sortBy) {
  const sorted = [...bookings]

  switch (sortBy) {
    case 'time-desc':
      return sorted.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
    case 'newest':
      return sorted.sort((a, b) => Number(b.id) - Number(a.id))
    case 'oldest':
      return sorted.sort((a, b) => Number(a.id) - Number(b.id))
    case 'party-desc':
      return sorted.sort((a, b) => b.party_size - a.party_size)
    case 'party-asc':
      return sorted.sort((a, b) => a.party_size - b.party_size)
    case 'time-asc':
    default:
      return sorted.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  }
}

function matchesSearch(booking, term) {
  if (!term) return true
  const haystack = `${booking.customer_name} ${booking.booking_reference}`.toLowerCase()
  return haystack.includes(term.toLowerCase())
}

function noShowEligibleAt(startsAt) {
  return new Date(new Date(startsAt).getTime() + 30 * 60 * 1000)
}

// deposit_refund_eligible is computed server-side (see GET /api/v1/admin/
// bookings) from the same 12-hour rule used to decide whether cancelling
// actually retains the deposit -- kept in one place so this label can never
// disagree with what the backend already decided.
function depositBadge(booking) {
  switch (booking.deposit_status) {
    case 'not_required':
      return { text: 'No deposit', tone: 'neutral' }
    case 'paid':
      return booking.deposit_refund_eligible
        ? { text: 'Refund Eligible', tone: 'info' }
        : { text: 'A$10 Paid', tone: 'success' }
    case 'refunded':
      return { text: 'Refunded', tone: 'neutral' }
    case 'retained':
      return { text: 'Retained', tone: 'danger' }
    case 'pending':
      return { text: 'A$10 Payment Pending', tone: 'warning' }
    default:
      return { text: 'No deposit', tone: 'neutral' }
  }
}

// Where the customer's confirmation went, and whether it arrived at the
// provider. Rows created before the Email/SMS choice existed have no
// method or status recorded.
const CONFIRMATION_METHOD_LABELS = { email: 'Email', sms: 'SMS' }
const CONFIRMATION_STATUS_LABELS = { sent: 'Sent', failed: 'Failed', pending: 'Sending' }

function confirmationSummary(booking) {
  const method = CONFIRMATION_METHOD_LABELS[booking.confirmation_method] || null
  let status = CONFIRMATION_STATUS_LABELS[booking.confirmation_delivery_status] || null

  if (!status) {
    status = booking.status === 'pending' ? 'Awaiting payment' : method ? 'Not sent' : null
  }

  return { method, status, failed: booking.confirmation_delivery_status === 'failed' }
}

// UI-level action tags for the confirm dialog map onto the actual target
// status the backend expects -- kept distinct from the status string itself
// so the dialog-selection logic below doesn't have to guess intent from the
// booking's current status.
const UNDO_TARGET_STATUS = {
  undo_seated: 'confirmed',
  undo_completed: 'seated',
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="admin-stat">
      <dt className="admin-stat-label">{label}</dt>
      <dd className="admin-stat-value">{value}</dd>
    </div>
  )
}

function BookingsPanel({ focusReference }) {
  const [selectedDate, setSelectedDate] = useState(todaySydneyDateKey())
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [focusError, setFocusError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [rowBusy, setRowBusy] = useState('')
  const [confirmTarget, setConfirmTarget] = useState(null) // { booking, action }
  const [sortBy, setSortBy] = useState('time-asc')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const { isFocused } = useFocusedCard(focusReference)
  const controlId = useId()

  const fetchBookings = (date) =>
    api
      .getAdminBookingsForDate(date)
      .then((data) => {
        setBookings(data.bookings)
        setError('')
        setLastUpdated(new Date())
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })

  useEffect(() => {
    fetchBookings(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    const id = setInterval(() => fetchBookings(selectedDate), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [selectedDate])

  // Deep link from a notification: the target booking might be on a date
  // that isn't currently loaded at all, so its date/status has to be
  // resolved from the server by reference first -- searching whatever's
  // already in `bookings` would silently miss it. Only the filter/search
  // state that would actually hide the match is touched (never the sort),
  // so arriving here doesn't reset preferences that weren't in the way.
  useEffect(() => {
    if (!focusReference) {
      setFocusError('')
      return undefined
    }

    let cancelled = false
    setFocusError('')

    api
      .getAdminBookingByReference(focusReference)
      .then((data) => {
        if (cancelled) return

        const booking = data.booking
        const bookingDateKey = sydneyDateKey(booking.starts_at)

        setSelectedDate((current) => (current === bookingDateKey ? current : bookingDateKey))
        setStatusFilter((current) => (current === 'all' || current === booking.status ? current : 'all'))
        setSearch((current) => (matchesSearch(booking, current) ? current : ''))
      })
      .catch((err) => {
        if (cancelled) return
        setFocusError(err.status === 404 ? 'That booking is no longer available.' : err.message)
      })

    return () => {
      cancelled = true
    }
  }, [focusReference])

  const handleManualRefresh = () => {
    setRefreshing(true)
    fetchBookings(selectedDate)
  }

  const summary = useMemo(() => {
    const guestsWithStatus = (statuses) =>
      bookings
        .filter((b) => statuses.includes(b.status))
        .reduce((sum, b) => sum + b.party_size, 0)

    return {
      totalBookings: bookings.length,
      expectedGuests: guestsWithStatus(['confirmed', 'seated', 'completed']),
      seatedGuests: guestsWithStatus(['seated', 'completed']),
      remainingExpectedGuests: guestsWithStatus(['confirmed']),
      noShowCount: bookings.filter((b) => b.status === 'no_show').length,
      cancelledCount: bookings.filter((b) => b.status === 'cancelled').length,
    }
  }, [bookings])

  const visible = useMemo(() => {
    let list = bookings

    if (statusFilter !== 'all') {
      list = list.filter((b) => b.status === statusFilter)
    }

    list = list.filter((b) => matchesSearch(b, search))

    return sortBookings(list, sortBy)
  }, [bookings, statusFilter, search, sortBy])

  const runStatusUpdate = async (booking, status, reason) => {
    setRowBusy(booking.booking_reference)

    try {
      await api.updateBookingStatus(booking.booking_reference, status, reason)
      await fetchBookings(selectedDate)
    } finally {
      setRowBusy('')
    }
  }

  const closeConfirm = () => setConfirmTarget(null)

  const handleConfirmedAction = async (reason) => {
    const status = UNDO_TARGET_STATUS[confirmTarget.action] || confirmTarget.action
    await runStatusUpdate(confirmTarget.booking, status, reason)
    setConfirmTarget(null)
  }

  const handleInstantAction = (booking, status) => {
    runStatusUpdate(booking, status).catch((err) => setError(err.message))
  }

  return (
    <div>
      <div className="admin-bookings-head">
        <div>
          <h2 className="admin-section-title admin-section-title-tight">Bookings</h2>
          <span className="admin-bookings-date">{formatDateKeyFull(selectedDate)}</span>
        </div>

        <div className="admin-date-controls">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSelectedDate(todaySydneyDateKey())}
          >
            Today
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSelectedDate(addDaysToDateKey(todaySydneyDateKey(), 1))}
          >
            Tomorrow
          </button>
          <label className="admin-date-input">
            <CalendarIcon />
            <span className="visually-hidden">Service date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="admin-refresh-row">
        <span className="field-hint" aria-live="polite">
          {lastUpdated
            ? `Last updated: ${lastUpdated.toLocaleTimeString('en-AU', {
                timeZone: 'Australia/Sydney',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              })}`
            : ' '}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleManualRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh bookings'}
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {focusError && <Alert type="error">{focusError}</Alert>}

      {loading ? (
        <LoadingState label="Loading bookings…" />
      ) : (
        <>
          <dl className="admin-stats admin-stats-6">
            <SummaryStat label="Total bookings" value={summary.totalBookings} />
            <SummaryStat label="Expected guests" value={summary.expectedGuests} />
            <SummaryStat label="Seated / arrived" value={summary.seatedGuests} />
            <SummaryStat label="Remaining expected" value={summary.remainingExpectedGuests} />
            <SummaryStat label="No-shows" value={summary.noShowCount} />
            <SummaryStat label="Cancelled" value={summary.cancelledCount} />
          </dl>

          <div className="admin-toolbar" role="search" aria-label="Filter bookings">
            <label className="admin-toolbar-label" htmlFor={`${controlId}-status`}>
              Status
            </label>
            <select
              id={`${controlId}-status`}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="admin-toolbar-label" htmlFor={`${controlId}-sort`}>
              Sort by
            </label>
            <select id={`${controlId}-sort`} value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="visually-hidden" htmlFor={`${controlId}-search`}>
              Search bookings by customer name or reference
            </label>
            <input
              id={`${controlId}-search`}
              type="search"
              placeholder="Search customer or reference…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState label="No bookings match for this date." />
          ) : (
            <div
              className="admin-table-wrap"
              role="region"
              aria-label={`Bookings for ${formatDateKeyFull(selectedDate)}`}
              tabIndex={0}
            >
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Booking</th>
                    <th scope="col">Guest</th>
                    <th scope="col">Party</th>
                    <th scope="col">Status</th>
                    <th scope="col">Deposit</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((booking) => {
                    const isBusy = rowBusy === booking.booking_reference
                    const eligibleAt = noShowEligibleAt(booking.starts_at)
                    const noShowReady = new Date() >= eligibleAt
                    const deposit = depositBadge(booking)
                    const confirmation = confirmationSummary(booking)

                    return (
                      <tr
                        className={isFocused(booking.booking_reference) ? 'admin-focused' : undefined}
                        key={booking.id}
                        data-focus-id={booking.booking_reference}
                      >
                        <td className="admin-cell-time">
                          {formatTime(booking.starts_at)}
                          <span className="admin-cell-sub">to {formatTime(booking.ends_at)}</span>
                        </td>
                        <th scope="row" className="admin-cell-ref">
                          {booking.booking_reference}
                        </th>
                        <td className="admin-cell-guest">
                          <span className="admin-cell-strong">{booking.customer_name}</span>
                          <a className="admin-cell-sub admin-contact" href={`mailto:${booking.customer_email}`}>
                            {booking.customer_email}
                          </a>
                          <span className="admin-cell-sub">
                            {booking.customer_phone || 'Phone not provided'}
                          </span>
                          {booking.special_requests && (
                            <span className="admin-cell-note">
                              <strong>Special requests:</strong> {booking.special_requests}
                            </span>
                          )}
                          {booking.status === 'cancelled' && booking.cancel_reason && (
                            <span className="admin-cell-note">
                              <strong>Cancel reason:</strong> {booking.cancel_reason}
                            </span>
                          )}
                        </td>
                        <td className="admin-cell-num">{booking.party_size}</td>
                        <td className="admin-cell-status">
                          <StatusBadge status={booking.status} />
                          <span className="admin-cell-sub admin-confirmation">
                            Confirmation:{' '}
                            {confirmation.method ? (
                              <>
                                {confirmation.method} ·{' '}
                                <span className={confirmation.failed ? 'admin-confirmation-failed' : undefined}>
                                  {confirmation.status}
                                </span>
                              </>
                            ) : (
                              'not recorded'
                            )}
                          </span>
                          {confirmation.failed && booking.confirmation_delivery_error && (
                            <span className="admin-cell-note admin-confirmation-error">
                              <strong>Not delivered:</strong> {booking.confirmation_delivery_error}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-${deposit.tone}`}>{deposit.text}</span>
                        </td>
                        <td className="admin-cell-actions">
                          {booking.status === 'confirmed' && (
                            <div className="admin-actions">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={isBusy}
                                onClick={() => handleInstantAction(booking, 'seated')}
                              >
                                {isBusy ? 'Working…' : 'Mark seated'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={!noShowReady || isBusy}
                                aria-describedby={!noShowReady ? `${controlId}-noshow-${booking.id}` : undefined}
                                onClick={() => setConfirmTarget({ booking, action: 'no_show' })}
                              >
                                Mark no-show
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger-outline btn-sm"
                                disabled={isBusy}
                                onClick={() => setConfirmTarget({ booking, action: 'cancelled' })}
                              >
                                Cancel booking
                              </button>
                              {!noShowReady && (
                                <span id={`${controlId}-noshow-${booking.id}`} className="field-hint admin-noshow-hint">
                                  No-show available after{' '}
                                  {eligibleAt.toLocaleTimeString('en-AU', {
                                    timeZone: 'Australia/Sydney',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </div>
                          )}

                          {booking.status === 'seated' && (
                            <div className="admin-actions">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={isBusy}
                                onClick={() => handleInstantAction(booking, 'completed')}
                              >
                                {isBusy ? 'Working…' : 'Mark completed'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={isBusy}
                                onClick={() => setConfirmTarget({ booking, action: 'undo_seated' })}
                              >
                                Undo seated
                              </button>
                            </div>
                          )}

                          {booking.status === 'completed' && (
                            <div className="admin-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={isBusy}
                                onClick={() => setConfirmTarget({ booking, action: 'undo_completed' })}
                              >
                                Undo completed
                              </button>
                            </div>
                          )}

                          {['cancelled', 'no_show'].includes(booking.status) && (
                            <span className="admin-cell-sub">No actions</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {confirmTarget && confirmTarget.action === 'no_show' && (
        <ConfirmDialog
          title="Mark this booking as a no-show?"
          danger
          confirmLabel="Confirm no-show"
          cancelLabel="Go back"
          onConfirm={handleConfirmedAction}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{confirmTarget.booking.customer_name}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{formatDateTime(confirmTarget.booking.starts_at)}</dd>
            </div>
            <div>
              <dt>Party</dt>
              <dd>{confirmTarget.booking.party_size} guests</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{confirmTarget.booking.booking_reference}</dd>
            </div>
          </dl>
        </ConfirmDialog>
      )}

      {confirmTarget && confirmTarget.action === 'cancelled' && (
        <ConfirmDialog
          title="Cancel this booking?"
          showReason
          reasonLabel="Reason (optional)"
          reasonPlaceholder="e.g. Requested by the customer over the phone"
          confirmLabel="Cancel booking"
          cancelLabel="Keep booking"
          danger
          onConfirm={handleConfirmedAction}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{confirmTarget.booking.customer_name}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{formatDateTime(confirmTarget.booking.starts_at)}</dd>
            </div>
            <div>
              <dt>Party</dt>
              <dd>{confirmTarget.booking.party_size} guests</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{confirmTarget.booking.booking_reference}</dd>
            </div>
          </dl>
        </ConfirmDialog>
      )}

      {confirmTarget && confirmTarget.action === 'undo_seated' && (
        <ConfirmDialog
          title="Undo seated status?"
          description="This will return the booking to Confirmed and update the live guest counts."
          confirmLabel="Undo Seated"
          cancelLabel="Keep Seated"
          onConfirm={handleConfirmedAction}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{confirmTarget.booking.customer_name}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{formatDateTime(confirmTarget.booking.starts_at)}</dd>
            </div>
            <div>
              <dt>Party</dt>
              <dd>{confirmTarget.booking.party_size} guests</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{confirmTarget.booking.booking_reference}</dd>
            </div>
          </dl>
        </ConfirmDialog>
      )}

      {confirmTarget && confirmTarget.action === 'undo_completed' && (
        <ConfirmDialog
          title="Undo completed status?"
          description="This will return the booking to Seated."
          confirmLabel="Undo Completed"
          cancelLabel="Keep Completed"
          onConfirm={handleConfirmedAction}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{confirmTarget.booking.customer_name}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{formatDateTime(confirmTarget.booking.starts_at)}</dd>
            </div>
            <div>
              <dt>Party</dt>
              <dd>{confirmTarget.booking.party_size} guests</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{confirmTarget.booking.booking_reference}</dd>
            </div>
          </dl>
        </ConfirmDialog>
      )}
    </div>
  )
}

export default BookingsPanel
