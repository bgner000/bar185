import { useMemo, useState } from 'react'
import StatusBadge from '../components/StatusBadge'
import { EmptyState } from '../components/Feedback'
import { formatDateTime } from '../lib/format'

const STATUS_OPTIONS = [
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_review', label: 'In Review' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'closed', label: 'Closed' },
  { value: 'declined', label: 'Declined' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'event-date', label: 'Preferred event date' },
  { value: 'guests-desc', label: 'Guest count (largest first)' },
]

const FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  ...STATUS_OPTIONS,
]

function sortEnquiries(enquiries, sortBy) {
  const sorted = [...enquiries]

  switch (sortBy) {
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    case 'event-date':
      return sorted.sort((a, b) => {
        if (!a.preferred_start_at) return 1
        if (!b.preferred_start_at) return -1
        return new Date(a.preferred_start_at) - new Date(b.preferred_start_at)
      })
    case 'guests-desc':
      return sorted.sort((a, b) => (b.expected_guest_count || 0) - (a.expected_guest_count || 0))
    case 'newest':
    default:
      return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }
}

function matchesSearch(enquiry, term) {
  if (!term) return true
  const haystack = `${enquiry.customer_name} ${enquiry.enquiry_reference}`.toLowerCase()
  return haystack.includes(term.toLowerCase())
}

function EnquiriesPanel({ enquiries, updatingReference, onStatusChange }) {
  const [sortBy, setSortBy] = useState('newest')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    let list = enquiries

    if (statusFilter !== 'all') {
      list = list.filter((e) => e.status === statusFilter)
    }

    list = list.filter((e) => matchesSearch(e, search))

    return sortEnquiries(list, sortBy)
  }, [enquiries, statusFilter, search, sortBy])

  if (enquiries.length === 0) {
    return <EmptyState label="No event enquiries yet." />
  }

  return (
    <div>
      <div className="admin-toolbar">
        <span className="admin-toolbar-label">Filter</span>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          {FILTER_OPTIONS.map((option) => (
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
        <EmptyState label="No enquiries match." />
      ) : (
        <div className="admin-card-list">
          {visible.map((enquiry) => {
        const isUpdating = updatingReference === enquiry.enquiry_reference

        return (
          <div className="card admin-request-card" key={enquiry.id}>
            <div className="admin-request-head">
              <div>
                <h3>{enquiry.enquiry_reference}</h3>
                <span className="field-hint">
                  {enquiry.preferred_start_at
                    ? formatDateTime(enquiry.preferred_start_at)
                    : 'No preferred date given'}
                </span>
              </div>
              <StatusBadge status={enquiry.status} />
            </div>

            <div className="admin-request-details">
              <div>
                <span className="admin-detail-label">Customer</span>
                <span>{enquiry.customer_name}</span>
              </div>
              <div>
                <span className="admin-detail-label">Email</span>
                <span>{enquiry.customer_email}</span>
              </div>
              <div>
                <span className="admin-detail-label">Phone</span>
                <span>{enquiry.customer_phone || 'Not provided'}</span>
              </div>
              <div>
                <span className="admin-detail-label">Event Type</span>
                <span>{enquiry.event_type || 'Not specified'}</span>
              </div>
              <div>
                <span className="admin-detail-label">Guests</span>
                <span>{enquiry.expected_guest_count || 'Not specified'}</span>
              </div>
            </div>

            <p className="admin-request-message">{enquiry.message}</p>

            <div className="field admin-status-field">
              <label htmlFor={`status-${enquiry.enquiry_reference}`}>Update status</label>
              <select
                id={`status-${enquiry.enquiry_reference}`}
                value={STATUS_OPTIONS.some((option) => option.value === enquiry.status) ? enquiry.status : ''}
                disabled={isUpdating}
                onChange={(event) => onStatusChange(enquiry.enquiry_reference, event.target.value)}
              >
                {enquiry.status === 'new' && (
                  <option value="" disabled>
                    New — choose next status
                  </option>
                )}
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {isUpdating && <span className="field-hint">Updating…</span>}
            </div>
          </div>
        )
          })}
        </div>
      )}
    </div>
  )
}

export default EnquiriesPanel
