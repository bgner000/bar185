// Booking deposit charges -- no real payment provider is connected yet.
//
// This deliberately mirrors the same contract already used by
// notifications/providers/email.js and sms.js: a single async function
// that returns { ok: true, providerId } on success or { ok: false, error }
// on failure, and never throws. Callers (backend/payments/index.js ->
// server.js) already branch on `.ok` exactly like they do for
// sendEmail/sendSms, so wiring in a real provider later is a matter of
// implementing the body of this function -- nothing that calls it needs
// to change.
//
// A real implementation (Stripe, Square, etc. -- not decided yet) would,
// at minimum:
//   - read provider credentials from environment variables (never
//     hardcoded, never committed -- same convention as RESEND_API_KEY /
//     TWILIO_* below)
//   - create/capture a charge for amountCents in currency
//   - return { ok: true, providerId: <the provider's charge/payment id> }
//     so it can be stored as bookings.payment_provider_reference
//   - return { ok: false, error } for any decline or provider-side error,
//     without throwing, so a payment failure fails the booking cleanly
//     rather than crashing the request
//
// Until then, every call fails safely and explicitly -- this is what
// makes it impossible for a deposit booking to be created without a real
// successful charge (see server.js's POST /api/v1/bookings).
// eslint-disable-next-line no-unused-vars -- signature documents the real contract before any implementation exists
async function chargeDeposit({ amountCents, currency, bookingReference, customerEmail, customerPhone }) {
  return {
    ok: false,
    error: 'Deposit payments are not yet available. Please choose email verification to secure your booking today.',
  };
}

module.exports = { chargeDeposit };
