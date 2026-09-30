import { useEffect, useId, useMemo, useState } from 'react'
import StatusBadge from '../components/StatusBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { Alert, EmptyState } from '../components/Feedback'
import { useFocusedCard } from '../lib/useFocusedCard'
import { formatDateTime } from '../lib/format'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'date-asc', label: 'Booking date ↑' },
  { value: 'date-desc', label: 'Booking date ↓' },
  { value: 'party-desc', label: 'Party size (largest first)' },
  { value: 'party-asc', label: 'Party size (smallest first)' },
]

function sortRequests(requests, sortBy) {
  const sorted = [...requests]

  switch (sortBy) {
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    case 'date-asc':
      return sorted.sort((a, b) => new Date(a.slot_start_at) - new Date(b.slot_start_at))
    case 'date-desc':
      return sorted.sort((a, b) => new Date(b.slot_start_at) - new Date(a.slot_start_at))
    case 'party-desc':
      return sorted.sort((a, b) => b.party_size - a.party_size)
    case 'party-asc':
      return sorted.sort((a, b) => a.party_size - b.party_size)
    case 'newest':
    default:
      return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }
}

function matchesSearch(request, term) {
  if (!term) return true
  const haystack = `${request.customer_name} ${request.request_reference}`.toLowerCase()
  return haystack.includes(term.toLowerCase())
}

function LargeGroupPanel({ requests, onApprove, onDecline, focusReference }) {
  const [tab, setTab] = useState('pending')
  const [historyFilter, setHistoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [search, setSearch] = useState('')
  const [confirmTarget, setConfirmTarget] = useState(null) // { request, action: 'approve' | 'decline' }
  const [focusError, setFocusError] = useState('')

  const { isFocused } = useFocusedCard(focusReference)
  const controlId = useId()

  // Deep link from a notification: the full request list is already in
  // memory (no per-item fetch needed here, unlike bookings), so this only
  // has to find it and adjust whichever bit of local state -- tab, the
  // history-only status filter, or a stale search term -- would otherwise
  // hide it. A request that's simply missing (e.g. a bad/old reference)
  // shows a small inline message rather than silently doing nothing.
  useEffect(() => {
    if (!focusReference) {
      setFocusError('')
      return
    }

    const target = requests.find((r) => r.request_reference === focusReference)

    if (!target) {
      setFocusError('That large-group request is no longer available.')
      return
    }

    setFocusError('')
    setTab(target.status === 'pending' ? 'pending' : 'history')

    if (target.status !== 'pending') {
      setHistoryFilter((current) => (current === 'all' || current === target.status ? current : 'all'))
    }

    setSearch((current) => (matchesSearch(target, current) ? current : ''))
  }, [focusReference, requests])

  const pending = requests.filter((r) => r.status === 'pending')
  const history = requests.filter((r) => r.status !== 'pending')

  const visibleHistory = useMemo(() => {
    if (historyFilter === 'all') return history
    return history.filter((r) => r.status === historyFilter)
  }, [history, historyFilter])

  const activeList = tab === 'pending' ? pending : visibleHistory

  const filteredSorted = useMemo(
    () => sortRequests(activeList.filter((r) => matchesSearch(r, search)), sortBy),
    [activeList, search, sortBy]
  )

  const closeConfirm = () => setConfirmTarget(null)

  const handleConfirm = async (reason) => {
    if (confirmTarget.action === 'approve') {
      await onApprove(confirmTarget.request.request_reference)
    } else {
      await onDecline(confirmTarget.request.request_reference, reason)
    }
    setConfirmTarget(null)
  }

  return (
    <div>
      {focusError && <Alert type="error">{focusError}</Alert>}

      <div className="admin-subtabs" role="group" aria-label="Request list">
        <button
          type="button"
          className={`admin-subtab${tab === 'pending' ? ' active' : ''}`}
          aria-pressed={tab === 'pending'}
          onClick={() => setTab('pending')}
        >
          Pending
          {pending.length > 0 && <span className="admin-subtab-count">({pending.length})</span>}
        </button>
        <button
          type="button"
          className={`admin-subtab${tab === 'history' ? ' active' : ''}`}
          aria-pressed={tab === 'history'}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      <div className="admin-toolbar" role="search" aria-label="Filter large-group requests">
        {tab === 'history' && (
          <>
            <label className="admin-toolbar-label" htmlFor={`${controlId}-status`}>
              Outcome
            </label>
            <select
              id={`${controlId}-status`}
              value={historyFilter}
              onChange={(event) => setHistoryFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="confirmed">Confirmed</option>
              <option value="declined">Declined</option>
            </select>
          </>
        )}

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
          Search requests by customer name or reference
        </label>
        <input
          id={`${controlId}-search`}
          type="search"
          placeholder="Search customer or reference…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {filteredSorted.length === 0 ? (
        <EmptyState
          label={tab === 'pending' ? 'No pending large-group requests.' : 'No matching requests.'}
        />
      ) : (
        <div
          className="admin-table-wrap"
          role="region"
          aria-label={tab === 'pending' ? 'Pending large-group requests' : 'Large-group request history'}
          tabIndex={0}
        >
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Requested for</th>
                <th scope="col">Guest</th>
                <th scope="col">Party</th>
                <th scope="col">Status</th>
                <th scope="col">{tab === 'pending' ? 'Actions' : 'Outcome'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((request) => (
                <tr
                  className={isFocused(request.request_reference) ? 'admin-focused' : undefined}
                  key={request.id}
                  data-focus-id={request.request_reference}
                >
                  <th scope="row" className="admin-cell-ref">
                    {request.request_reference}
                    <span className="admin-cell-sub">Received {formatDateTime(request.created_at)}</span>
                  </th>
                  <td className="admin-cell-time">{formatDateTime(request.slot_start_at)}</td>
                  <td className="admin-cell-guest">
                    <span className="admin-cell-strong">{request.customer_name}</span>
                    <a className="admin-cell-sub admin-contact" href={`mailto:${request.customer_email}`}>
                      {request.customer_email}
                    </a>
                    <span className="admin-cell-sub">{request.customer_phone || 'Phone not provided'}</span>
                    {request.confirmation_method && (
                      <span className="admin-cell-sub admin-confirmation">
                        Confirm by {request.confirmation_method === 'sms' ? 'SMS' : 'Email'}
                      </span>
                    )}
                  </td>
                  <td className="admin-cell-num">{request.party_size}</td>
                  <td>
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="admin-cell-actions">
                    {request.status === 'pending' ? (
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setConfirmTarget({ request, action: 'approve' })}
                        >
                          Approve request
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-sm"
                          onClick={() => setConfirmTarget({ request, action: 'decline' })}
                        >
                          Decline request
                        </button>
                      </div>
                    ) : request.status === 'declined' && request.decline_reason ? (
                      <span className="admin-cell-note">
                        <strong>Decline reason:</strong> {request.decline_reason}
                      </span>
                    ) : (
                      <span className="admin-cell-sub">No further action needed.</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmTarget && confirmTarget.action === 'approve' && (
        <ConfirmDialog
          title="Approve this large-group booking?"
          confirmLabel="Approve request"
          cancelLabel="Go back"
          onConfirm={handleConfirm}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{confirmTarget.request.customer_name}</dd>
            </div>
            <div>
              <dt>Date &amp; time</dt>
              <dd>{formatDateTime(confirmTarget.request.slot_start_at)}</dd>
            </div>
            <div>
              <dt>Party size</dt>
              <dd>{confirmTarget.request.party_size} guests</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{confirmTarget.request.request_reference}</dd>
            </div>
          </dl>
        </ConfirmDialog>
      )}

      {confirmTarget && confirmTarget.action === 'decline' && (
        <ConfirmDialog
          title="Decline this large-group booking request?"
          showReason
          reasonRequired
          reasonLabel="Reason (kept for staff records)"
          reasonPlaceholder="e.g. No availability for this party size on the requested date"
          confirmLabel="Decline request"
          cancelLabel="Go back"
          danger
          onConfirm={handleConfirm}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{confirmTarget.request.customer_name}</dd>
            </div>
            <div>
              <dt>Date &amp; time</dt>
              <dd>{formatDateTime(confirmTarget.request.slot_start_at)}</dd>
            </div>
            <div>
              <dt>Party size</dt>
              <dd>{confirmTarget.request.party_size} guests</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{confirmTarget.request.request_reference}</dd>
            </div>
          </dl>
        </ConfirmDialog>
      )}
    </div>
  )
}

export default LargeGroupPanel
