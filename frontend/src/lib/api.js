const API_BASE_URL = 'http://localhost:3000/api/v1'

// The backend also serves static files (uploaded menu documents) outside
// the /api/v1 prefix, so callers that need an absolute URL for one of those
// (e.g. an <a href> or a PDF viewer `src`) use this rather than hardcoding
// the origin a second time.
export const API_ORIGIN = 'http://localhost:3000'

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

// Multipart uploads must not set Content-Type themselves — the browser needs
// to add its own boundary — so this bypasses request()'s JSON default.
async function uploadRequest(path, formData, method = 'POST') {
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: adminHeaders(),
      body: formData,
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

export const api = {
  health: () => request('/health'),

  getBookingSlots: () => request('/booking-slots'),

  getVenueHours: () => request('/venue-hours'),

  createBooking: (payload) =>
    request('/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  startDepositBooking: (payload) =>
    request('/bookings/deposit/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDepositStatus: (checkoutSessionId) =>
    request(`/bookings/deposit/status?checkoutSessionId=${encodeURIComponent(checkoutSessionId)}`),

  sendVerificationCode: (payload) =>
    request('/verification/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyCode: (payload) =>
    request('/verification/verify', {
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

  getAdminNotifications: (limit) =>
    request(`/admin/notifications${limit ? `?limit=${encodeURIComponent(limit)}` : ''}`, {
      headers: adminHeaders(),
    }),

  markNotificationRead: (id) =>
    request(`/admin/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      headers: adminHeaders(),
    }),

  markAllNotificationsRead: () =>
    request('/admin/notifications/read-all', {
      method: 'PATCH',
      headers: adminHeaders(),
    }),

  approveLargeGroupRequest: (requestReference) =>
    request(
      `/admin/large-group-booking-requests/${encodeURIComponent(requestReference)}/approve`,
      { method: 'PATCH', headers: adminHeaders() }
    ),

  declineLargeGroupRequest: (requestReference, reason) =>
    request(
      `/admin/large-group-booking-requests/${encodeURIComponent(requestReference)}/decline`,
      { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ reason }) }
    ),

  updateEventEnquiryStatus: (enquiryReference, status) =>
    request(`/admin/event-enquiries/${encodeURIComponent(enquiryReference)}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    }),

  getAdminBookingsForDate: (date) =>
    request(`/admin/bookings?date=${encodeURIComponent(date)}`, { headers: adminHeaders() }),

  getAdminBookingByReference: (bookingReference) =>
    request(`/admin/bookings/${encodeURIComponent(bookingReference)}`, { headers: adminHeaders() }),

  updateBookingStatus: (bookingReference, status, reason) =>
    request(`/admin/bookings/${encodeURIComponent(bookingReference)}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status, reason }),
    }),

  getPublicMenu: () => request('/menu'),

  getAdminMenuList: () => request('/admin/menu', { headers: adminHeaders() }),

  addMenuPage: (file, title) => {
    const formData = new FormData()
    formData.append('pageFile', file)
    if (title) formData.append('title', title)
    return uploadRequest('/admin/menu/pages', formData)
  },

  replaceMenuPage: (pageId, file, title) => {
    const formData = new FormData()
    if (file) formData.append('pageFile', file)
    if (title !== undefined) formData.append('title', title)
    return uploadRequest(`/admin/menu/pages/${encodeURIComponent(pageId)}`, formData, 'PATCH')
  },

  deleteMenuPage: (pageId) =>
    request(`/admin/menu/pages/${encodeURIComponent(pageId)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    }),

  reorderMenuPages: (pageIds) =>
    request('/admin/menu/pages/reorder', {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ pageIds }),
    }),

  deleteMenuVersion: (versionId) =>
    request(`/admin/menu/versions/${encodeURIComponent(versionId)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    }),

  getEvents: () => request('/events'),

  getAdminEvents: () => request('/admin/events', { headers: adminHeaders() }),

  createEvent: (payload) =>
    request('/admin/events', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(payload),
    }),

  updateEvent: (eventReference, payload) =>
    request(`/admin/events/${encodeURIComponent(eventReference)}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify(payload),
    }),

  updateEventStatus: (eventReference, status) =>
    request(`/admin/events/${encodeURIComponent(eventReference)}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    }),
}

export default api
