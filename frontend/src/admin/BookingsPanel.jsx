import StatusBadge from '../components/StatusBadge'
import { EmptyState } from '../components/Feedback'
import { formatDateTime } from '../lib/format'

function BookingsPanel({ bookings }) {
  if (bookings.length === 0) {
    return <EmptyState label="No active bookings right now." />
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Customer</th>
            <th>Party</th>
            <th>Date &amp; Time</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td>{booking.booking_reference}</td>
              <td>{booking.customer_name}</td>
              <td>{booking.party_size}</td>
              <td>{booking.starts_at ? formatDateTime(booking.starts_at) : '—'}</td>
              <td>{booking.customer_email}</td>
              <td>{booking.customer_phone || 'Not provided'}</td>
              <td>
                <StatusBadge status={booking.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default BookingsPanel
