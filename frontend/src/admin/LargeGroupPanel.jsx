import { useMemo, useState } from 'react'
import StatusBadge from '../components/StatusBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { EmptyState } from '../components/Feedback'
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

function LargeGroupPanel({ requests, onApprove, onDecline }) {
  const [tab, setTab] = useState('pending')
  const [historyFilter, setHistoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [search, setSearch] = useState('')
  const [confirmTarget, setConfirmTarget] = useState(null) // { request, action: 'approve' | 'decline' }

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
      <div className="admin-subtabs">
        <button
          type="button"
          className={`admin-subtab${tab === 'pending' ? ' active' : ''}`}
          onClick={() => setTab('pending')}
        >
          Pending
          {pending.length > 0 && <span className="admin-subtab-count">({pending.length})</span>}
        </button>
        <button
          type="button"
          className={`admin-subtab${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      <div className="admin-toolbar">
        {tab === 'history' && (
          <>
            <span className="admin-toolbar-label">Filter</span>
            <select value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="confirmed">Confirmed</option>
              <option value="declined">Declined</option>
            </select>
          </>
        )}

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

      {filteredSorted.length === 0 ? (
        <EmptyState
          label={tab === 'pending' ? 'No pending large-group requests.' : 'No matching requests.'}
        />
      ) : (
        <div className="admin-card-list">
          {filteredSorted.map((request) => {
            return (
              <div className="card admin-request-card" key={request.id}>
                <div className="admin-request-head">
                  <div>
                    <h3>{request.request_reference}</h3>
                    <span className="field-hint">{formatDateTime(request.slot_start_at)}</span>
                  </div>
                  <StatusBadge status={request.status} />
                </div>

                <div className="admin-request-details">
                  <div>
                    <span className="admin-detail-label">Customer</span>
                    <span>{request.customer_name}</span>
                  </div>
                  <div>
                    <span className="admin-detail-label">Party</span>
                    <span>{request.party_size} guests</span>
                  </div>
                  <div>
                    <span className="admin-detail-label">Email</span>
                    <span>{request.customer_email}</span>
                  </div>
                  <div>
                    <span className="admin-detail-label">Phone</span>
                    <span>{request.customer_phone || 'Not provided'}</span>
                  </div>
                </div>

                {request.status === 'pending' ? (
                  <div className="admin-request-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setConfirmTarget({ request, action: 'approve' })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      onClick={() => setConfirmTarget({ request, action: 'decline' })}
                    >
                      Decline
                    </button>
                  </div>
                ) : request.status === 'declined' && request.decline_reason ? (
                  <p className="admin-request-message">
                    <strong>Decline reason:</strong> {request.decline_reason}
                  </p>
                ) : (
                  <p className="field-hint">
                    This request is {request.status} and no longer needs action.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {confirmTarget && confirmTarget.action === 'approve' && (
        <ConfirmDialog
          title="Approve this large-group booking?"
          confirmLabel="Confirm Approval"
          onConfirm={handleConfirm}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <span>Customer</span>
              <span>{confirmTarget.request.customer_name}</span>
            </div>
            <div>
              <span>Date &amp; time</span>
              <span>{formatDateTime(confirmTarget.request.slot_start_at)}</span>
            </div>
            <div>
              <span>Party size</span>
              <span>{confirmTarget.request.party_size} guests</span>
            </div>
            <div>
              <span>Reference</span>
              <span>{confirmTarget.request.request_reference}</span>
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
          confirmLabel="Confirm Decline"
          danger
          onConfirm={handleConfirm}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <span>Customer</span>
              <span>{confirmTarget.request.customer_name}</span>
            </div>
            <div>
              <span>Date &amp; time</span>
              <span>{formatDateTime(confirmTarget.request.slot_start_at)}</span>
            </div>
            <div>
              <span>Party size</span>
              <span>{confirmTarget.request.party_size} guests</span>
            </div>
            <div>
              <span>Reference</span>
              <span>{confirmTarget.request.request_reference}</span>
            </div>
          </dl>
        </ConfirmDialog>
      )}
    </div>
  )
}

export default LargeGroupPanel
