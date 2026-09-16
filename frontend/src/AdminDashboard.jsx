import { useEffect, useState } from 'react'

function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingReference, setUpdatingReference] = useState('')

  const loadDashboard = async () => {
    const response = await fetch(
      'http://localhost:3000/api/v1/admin/dashboard',
      {
        headers: {
          'X-Demo-User-Email': 'admin@bar185.local',
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Could not load dashboard')
    }

    setDashboard(data)
  }

  useEffect(() => {
    loadDashboard()
      .catch((err) => {
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const updateEventEnquiryStatus = async (
    enquiryReference,
    newStatus
  ) => {
    setError('')
    setUpdatingReference(enquiryReference)

    try {
      const response = await fetch(
        `http://localhost:3000/api/v1/admin/event-enquiries/${enquiryReference}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Demo-User-Email': 'admin@bar185.local',
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not update event enquiry'
        )
      }

      setDashboard((current) => ({
        ...current,
        dashboard: {
          ...current.dashboard,
          eventEnquiries:
            current.dashboard.eventEnquiries.map((enquiry) =>
              enquiry.enquiry_reference === enquiryReference
                ? {
                    ...enquiry,
                    ...data.enquiry,
                  }
                : enquiry
            ),
        },
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdatingReference('')
    }
  }

  const reviewLargeGroupRequest = async (
  requestReference,
  action
) => {
  setError('')
  setUpdatingReference(requestReference)

  try
  {
    const response = await fetch(
      `http://localhost:3000/api/v1/admin/large-group-booking-requests/${requestReference}/${action}`,
      {
        method: 'PATCH',
        headers: {
          'X-Demo-User-Email': 'admin@bar185.local',
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        data.message || `Could not ${action} request`
      )
    }

    await loadDashboard()
  } catch (err) {
    setError(err.message)
  } finally {
    setUpdatingReference('')
  }
}

  if (loading) {
    return (
      <main>
        <h1>Loading Admin Dashboard...</h1>
      </main>
    )
  }

  if (error && !dashboard) {
    return (
      <main>
        <h1>Admin Dashboard</h1>
        <p>{error}</p>
      </main>
    )
  }

  return (
    <main>
      <h1>Bar 185 Admin Dashboard</h1>

      <p>
        Signed in as:{' '}
        <strong>{dashboard.admin.displayName}</strong>
      </p>

      <p>
        Role: <strong>{dashboard.admin.role}</strong>
      </p>

      {error && <p>{error}</p>}

      <hr />

      <h2>Bookings</h2>

      {dashboard.dashboard.bookings.length === 0 ? (
        <p>No bookings.</p>
      ) : (
        dashboard.dashboard.bookings.map((booking) => (
          <div key={booking.id}>
            <h3>{booking.booking_reference}</h3>

            <p>
              <strong>Customer:</strong>{' '}
              {booking.customer_name}
            </p>

            <p>
              <strong>Guests:</strong>{' '}
              {booking.party_size}
            </p>

            <p>
              <strong>Status:</strong>{' '}
              {booking.status}
            </p>

            <p>
              <strong>Email:</strong>{' '}
              {booking.customer_email}
            </p>

            <p>
              <strong>Phone:</strong>{' '}
              {booking.customer_phone || 'Not provided'}
            </p>

            <hr />
          </div>
        ))
      )}

      <h2>Large-Group Requests</h2>

      {dashboard.dashboard.largeGroupRequests.length === 0 ? (
        <p>No large-group requests.</p>
      ) : (
        dashboard.dashboard.largeGroupRequests.map((request) => (
          <div key={request.id}>
            <h3>{request.request_reference}</h3>

            <p>
              <strong>Customer:</strong>{' '}
              {request.customer_name}
            </p>

            <p>
              <strong>Guests:</strong>{' '}
              {request.party_size}
            </p>

            <p>
              <strong>Status:</strong>{' '}
              {request.status}
            </p>

            <p>
              <strong>Email:</strong>{' '}
              {request.customer_email}
            </p>

            <p>
              <strong>Phone:</strong>{' '}
              {request.customer_phone || 'Not provided'}
            </p>
            {request.status === 'pending' && (
  <div>
    <button
      disabled={
        updatingReference === request.request_reference
      }
      onClick={() =>
        reviewLargeGroupRequest(
          request.request_reference,
          'approve'
        )
      }
    >
      Approve
    </button>

    {' '}

    <button
      disabled={
        updatingReference === request.request_reference
      }
      onClick={() =>
        reviewLargeGroupRequest(
          request.request_reference,
          'decline'
        )
      }
    >
      Decline
    </button>

    {updatingReference === request.request_reference && (
      <p>Updating...</p>
    )}
  </div>
)} 
            <hr />
          </div>
        ))
      )}

      <h2>Event Enquiries</h2>

      {dashboard.dashboard.eventEnquiries.length === 0 ? (
        <p>No event enquiries.</p>
      ) : (
        dashboard.dashboard.eventEnquiries.map((enquiry) => (
          <div key={enquiry.id}>
            <h3>{enquiry.enquiry_reference}</h3>

            <p>
              <strong>Customer:</strong>{' '}
              {enquiry.customer_name}
            </p>

            <p>
              <strong>Email:</strong>{' '}
              {enquiry.customer_email}
            </p>

            <p>
              <strong>Phone:</strong>{' '}
              {enquiry.customer_phone || 'Not provided'}
            </p>

            <p>
              <strong>Event:</strong>{' '}
              {enquiry.event_type || 'Not specified'}
            </p>

            <p>
              <strong>Guests:</strong>{' '}
              {enquiry.expected_guest_count || 'Not specified'}
            </p>

            <p>
              <strong>Status:</strong>{' '}
              {enquiry.status}
            </p>

            <p>
              <strong>Message:</strong>{' '}
              {enquiry.message}
            </p>

            <label>
              <strong>Change status: </strong>

              <select
                value={enquiry.status}
                disabled={
                  updatingReference ===
                  enquiry.enquiry_reference
                }
                onChange={(event) =>
                  updateEventEnquiryStatus(
                    enquiry.enquiry_reference,
                    event.target.value
                  )
                }
              >
                <option value="new" disabled>
                  New
                </option>

                <option value="acknowledged">
                  Acknowledged
                </option>

                <option value="in_review">
                  In Review
                </option>

                <option value="contacted">
                  Contacted
                </option>

                <option value="quoted">
                  Quoted
                </option>

                <option value="closed">
                  Closed
                </option>

                <option value="declined">
                  Declined
                </option>
              </select>
            </label>

            {updatingReference ===
              enquiry.enquiry_reference && (
              <p>Updating...</p>
            )}

            <hr />
          </div>
        ))
      )}
    </main>
  )
}

export default AdminDashboard