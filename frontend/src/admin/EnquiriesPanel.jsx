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

function EnquiriesPanel({ enquiries, updatingReference, onStatusChange }) {
  if (enquiries.length === 0) {
    return <EmptyState label="No event enquiries yet." />
  }

  return (
    <div className="admin-card-list">
      {enquiries.map((enquiry) => {
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
  )
}

export default EnquiriesPanel
