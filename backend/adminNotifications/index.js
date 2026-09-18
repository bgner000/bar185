const pool = require('../db');

// Every notify* function below is safe to `await` unconditionally: internal
// errors are caught and logged rather than rejecting, so a notification
// problem can never fail the booking/request/enquiry action that triggered
// it. Mirrors the same `safely` pattern used by ../notifications (the
// customer-facing email/SMS module) for the same reason.
async function safely(label, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(`Admin notification error (${label}):`, error.message);
  }
}

// Inserts one admin notification. The ON CONFLICT DO NOTHING (matching the
// partial unique index on (type, entity_type, entity_id) from schema.sql
// migration 16) is what makes this safe to call more than once for the
// same underlying event -- e.g. a large-group-request retry replayed
// through the existing idempotency-key system, or any other accidental
// double-call -- without ever producing a duplicate row.
function createNotification({ type, title, message, entityType = null, entityId = null, metadata = null }) {
  return safely(`create ${type}`, async () => {
    await pool.query(
      `
      INSERT INTO admin_notifications (type, title, message, entity_type, entity_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (type, entity_type, entity_id) WHERE entity_id IS NOT NULL DO NOTHING
      `,
      [type, title, message, entityType, entityId, metadata ? JSON.stringify(metadata) : null]
    );
  });
}

// Customer completed a standard (email-verified) booking, or a deposit
// booking whose payment Stripe just confirmed. NOT called for a large-group
// request approved by an admin -- that's an admin action, and the request's
// own creation already produced a 'large_group_request' notification.
function notifyNewBooking(booking, slot) {
  return createNotification({
    type: 'new_booking',
    title: 'New booking',
    message: `${booking.customer_name} booked a table for ${booking.party_size}.`,
    entityType: 'booking',
    entityId: booking.id,
    metadata: {
      bookingReference: booking.booking_reference,
      startsAt: slot?.starts_at || null,
      partySize: booking.party_size,
    },
  });
}

// Customer cancelled their own booking. NOT called when an admin cancels a
// booking on a customer's behalf via the admin status-transition route --
// that's an admin action, not a customer event to alert the admin about.
function notifyBookingCancelled(booking) {
  return createNotification({
    type: 'booking_cancelled',
    title: 'Booking cancelled',
    message: `${booking.customer_name} cancelled booking ${booking.booking_reference}.`,
    entityType: 'booking',
    entityId: booking.id,
    metadata: {
      bookingReference: booking.booking_reference,
    },
  });
}

function notifyLargeGroupRequest(request) {
  return createNotification({
    type: 'large_group_request',
    title: 'Large-group request',
    message: `New booking request for ${request.party_size} guests.`,
    entityType: 'large_group_request',
    entityId: request.id,
    metadata: {
      requestReference: request.request_reference,
      partySize: request.party_size,
      slotStartAt: request.slot_start_at,
    },
  });
}

function notifyEventEnquiry(enquiry) {
  return createNotification({
    type: 'event_enquiry',
    title: 'New event enquiry',
    message: `New event enquiry received from ${enquiry.customer_name}.`,
    entityType: 'event_enquiry',
    entityId: enquiry.id,
    metadata: {
      enquiryReference: enquiry.enquiry_reference,
    },
  });
}

module.exports = {
  notifyNewBooking,
  notifyBookingCancelled,
  notifyLargeGroupRequest,
  notifyEventEnquiry,
};
