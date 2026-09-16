import StatusBadge from '../components/StatusBadge'
import { EmptyState } from '../components/Feedback'
import { formatDateTime } from '../lib/format'

function LargeGroupPanel({ requests, updatingReference, onApprove, onDecline }) {
  if (requests.length === 0) {
    return <EmptyState label="No large-group requests yet." />
  }

  return (
    <div className="admin-card-list">
      {requests.map((request) => {
        const isUpdating = updatingReference === request.request_reference

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
                  disabled={isUpdating}
                  onClick={() => onApprove(request.request_reference)}
                >
                  {isUpdating ? 'Working…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger-outline btn-sm"
                  disabled={isUpdating}
                  onClick={() => onDecline(request.request_reference)}
                >
                  {isUpdating ? 'Working…' : 'Decline'}
                </button>
              </div>
            ) : (
              <p className="field-hint">
                This request is {request.status} and no longer needs action.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default LargeGroupPanel
