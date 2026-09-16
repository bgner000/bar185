const API_BASE_URL = 'http://localhost:3000/api/v1'

// Demo-only admin identification header. There is no real login system yet —
// see instructions in AdminDashboard for how staff access is currently gated.
export const ADMIN_DEMO_EMAIL = 'admin@bar185.local'

async function request(path, options = {}) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Could not reach the Bar 185 server. Please try again shortly.')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong. Please try again.')
    error.status = response.status
    error.body = data
    throw error
  }

  return data
}

function adminHeaders() {
  return { 'X-Demo-User-Email': ADMIN_DEMO_EMAIL }
}

export const api = {
  health: () => request('/health'),

  getBookingSlots: () => request('/booking-slots'),

  createBooking: (payload) =>
    request('/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelBooking: (bookingReference, customerEmail) =>
    request(`/bookings/${encodeURIComponent(bookingReference)}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ customerEmail }),
    }),

  createLargeGroupBookingRequest: (payload, idempotencyKey) =>
    request('/large-group-booking-requests', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    }),

  createEventEnquiry: (payload) =>
    request('/event-enquiries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAdminDashboard: () =>
    request('/admin/dashboard', { headers: adminHeaders() }),

  approveLargeGroupRequest: (requestReference) =>
    request(
      `/admin/large-group-booking-requests/${encodeURIComponent(requestReference)}/approve`,
      { method: 'PATCH', headers: adminHeaders() }
    ),

  declineLargeGroupRequest: (requestReference) =>
    request(
      `/admin/large-group-booking-requests/${encodeURIComponent(requestReference)}/decline`,
      { method: 'PATCH', headers: adminHeaders() }
    ),

  updateEventEnquiryStatus: (enquiryReference, status) =>
    request(`/admin/event-enquiries/${encodeURIComponent(enquiryReference)}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    }),
}

export default api
