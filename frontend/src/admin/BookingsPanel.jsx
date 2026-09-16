import { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import ConfirmDialog from '../components/ConfirmDialog'
import StatusBadge from '../components/StatusBadge'
import { Alert, LoadingState, EmptyState } from '../components/Feedback'
import {
  formatTime,
  formatDateTime,
  formatDateKeyFull,
  todaySydneyDateKey,
  addDaysToDateKey,
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
        ? { text: 'Refund eligible', tone: 'info' }
        : { text: 'A$10 Paid', tone: 'success' }
    case 'refunded':
      return { text: 'Refunded', tone: 'neutral' }
    case 'retained':
      return { text: 'Retained', tone: 'danger' }
    case 'pending':
      return { text: 'Deposit pending', tone: 'warning' }
    default:
      return { text: 'No deposit', tone: 'neutral' }
  }
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

function SummaryCard({ label, value }) {
  return (
    <div className="card admin-summary-card">
      <span className="admin-summary-value">{value}</span>
      <span className="admin-summary-label">{label}</span>
    </div>
  )
}

function BookingsPanel() {
  const [selectedDate, setSelectedDate] = useState(todaySydneyDateKey())
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [rowBusy, setRowBusy] = useState('')
  const [confirmTarget, setConfirmTarget] = useState(null) // { booking, action }
  const [sortBy, setSortBy] = useState('time-asc')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

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
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
              aria-label="Choose a service date"
            />
          </label>
        </div>
      </div>

      <div className="admin-refresh-row">
        <span className="field-hint">
          {lastUpdated
            ? `Last updated: ${lastUpdated.toLocaleTimeString('en-AU', {
                timeZone: 'Australia/Sydney',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              })}`
            : ' '}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleManualRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {loading ? (
        <LoadingState label="Loading bookings…" />
      ) : (
        <>
          <div className="grid grid-3 admin-summary">
            <SummaryCard label="Total Bookings" value={summary.totalBookings} />
            <SummaryCard label="Expected Guests" value={summary.expectedGuests} />
            <SummaryCard label="Seated / Arrived" value={summary.seatedGuests} />
            <SummaryCard label="Remaining Expected" value={summary.remainingExpectedGuests} />
            <SummaryCard label="No-shows" value={summary.noShowCount} />
            <SummaryCard label="Cancelled" value={summary.cancelledCount} />
          </div>

          <div className="admin-toolbar">
            <span className="admin-toolbar-label">Filter</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <span className="admin-toolbar-label">Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              type="search"
              placeholder="Search customer or reference…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState label="No bookings match for this date." />
          ) : (
            <div className="admin-card-list">
              {visible.map((booking) => {
                const isBusy = rowBusy === booking.booking_reference
                const eligibleAt = noShowEligibleAt(booking.starts_at)
                const noShowReady = new Date() >= eligibleAt

                return (
                  <div className="card admin-request-card" key={booking.id}>
                    <div className="admin-request-head">
                      <div>
                        <h3>{booking.booking_reference}</h3>
                        <span className="field-hint">
                          {formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}
                        </span>
                      </div>
                      <StatusBadge status={booking.status} />
                    </div>

                    <div className="admin-request-details">
                      <div>
                        <span className="admin-detail-label">Customer</span>
                        <span>{booking.customer_name}</span>
                      </div>
                      <div>
                        <span className="admin-detail-label">Party</span>
                        <span>{booking.party_size} guests</span>
                      </div>
                      <div>
                        <span className="admin-detail-label">Email</span>
                        <span>{booking.customer_email}</span>
                      </div>
                      <div>
                        <span className="admin-detail-label">Phone</span>
                        <span>{booking.customer_phone || 'Not provided'}</span>
                      </div>
                      <div>
                        <span className="admin-detail-label">Deposit</span>
                        <span className={`badge badge-${depositBadge(booking).tone}`}>
                          {depositBadge(booking).text}
                        </span>
                      </div>
                    </div>

                    {booking.special_requests && (
                      <p className="admin-request-message">
                        <strong>Special requests:</strong> {booking.special_requests}
                      </p>
                    )}

                    {booking.status === 'cancelled' && booking.cancel_reason && (
                      <p className="admin-request-message">
                        <strong>Cancel reason:</strong> {booking.cancel_reason}
                      </p>
                    )}

                    {booking.status === 'confirmed' && (
                      <div className="admin-request-actions admin-request-actions-wrap">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={isBusy}
                          onClick={() => handleInstantAction(booking, 'seated')}
                        >
                          {isBusy ? 'Working…' : 'Mark Seated'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={!noShowReady || isBusy}
                          onClick={() => setConfirmTarget({ booking, action: 'no_show' })}
                        >
                          Mark No-Show
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-sm"
                          disabled={isBusy}
                          onClick={() => setConfirmTarget({ booking, action: 'cancelled' })}
                        >
                          Cancel
                        </button>
                        {!noShowReady && (
                          <span className="field-hint admin-noshow-hint">
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
                      <div className="admin-request-actions admin-request-actions-wrap">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={isBusy}
                          onClick={() => handleInstantAction(booking, 'completed')}
                        >
                          {isBusy ? 'Working…' : 'Mark Completed'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={isBusy}
                          onClick={() => setConfirmTarget({ booking, action: 'undo_seated' })}
                        >
                          Undo Seated
                        </button>
                      </div>
                    )}

                    {booking.status === 'completed' && (
                      <div className="admin-request-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={isBusy}
                          onClick={() => setConfirmTarget({ booking, action: 'undo_completed' })}
                        >
                          Undo Completed
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {confirmTarget && confirmTarget.action === 'no_show' && (
        <ConfirmDialog
          title="Mark this booking as a no-show?"
          danger
          confirmLabel="Confirm No-Show"
          onConfirm={handleConfirmedAction}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <span>Customer</span>
              <span>{confirmTarget.booking.customer_name}</span>
            </div>
            <div>
              <span>Time</span>
              <span>{formatDateTime(confirmTarget.booking.starts_at)}</span>
            </div>
            <div>
              <span>Party</span>
              <span>{confirmTarget.booking.party_size} guests</span>
            </div>
            <div>
              <span>Reference</span>
              <span>{confirmTarget.booking.booking_reference}</span>
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
          confirmLabel="Confirm Cancellation"
          danger
          onConfirm={handleConfirmedAction}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <span>Customer</span>
              <span>{confirmTarget.booking.customer_name}</span>
            </div>
            <div>
              <span>Time</span>
              <span>{formatDateTime(confirmTarget.booking.starts_at)}</span>
            </div>
            <div>
              <span>Party</span>
              <span>{confirmTarget.booking.party_size} guests</span>
            </div>
            <div>
              <span>Reference</span>
              <span>{confirmTarget.booking.booking_reference}</span>
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
              <span>Customer</span>
              <span>{confirmTarget.booking.customer_name}</span>
            </div>
            <div>
              <span>Time</span>
              <span>{formatDateTime(confirmTarget.booking.starts_at)}</span>
            </div>
            <div>
              <span>Party</span>
              <span>{confirmTarget.booking.party_size} guests</span>
            </div>
            <div>
              <span>Reference</span>
              <span>{confirmTarget.booking.booking_reference}</span>
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
              <span>Customer</span>
              <span>{confirmTarget.booking.customer_name}</span>
            </div>
            <div>
              <span>Time</span>
              <span>{formatDateTime(confirmTarget.booking.starts_at)}</span>
            </div>
            <div>
              <span>Party</span>
              <span>{confirmTarget.booking.party_size} guests</span>
            </div>
            <div>
              <span>Reference</span>
              <span>{confirmTarget.booking.booking_reference}</span>
            </div>
          </dl>
        </ConfirmDialog>
      )}
    </div>
  )
}

export default BookingsPanel
