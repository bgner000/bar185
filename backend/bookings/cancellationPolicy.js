// Reusable cancellation-timing rule for deposit-secured bookings, shared by
// the customer-facing cancel route and the admin status route so the two
// can never disagree about when a deposit is refund-eligible vs. retained.
//
// starts_at (from booking_slots) and the "as of" timestamp are both
// TIMESTAMPTZ -- absolute instants -- so this comparison is correct
// regardless of what timezone the database or server process is running
// in. No conversion to Australia/Sydney wall-clock time is needed (or
// correct) for the comparison itself; Sydney time only matters when
// *displaying* these timestamps, which the frontend already does via
// formatDateTime.
const REFUND_ELIGIBILITY_HOURS = 12;
const REFUND_ELIGIBILITY_MS = REFUND_ELIGIBILITY_HOURS * 60 * 60 * 1000;

// asOf is the moment the cancellation happens (or "now" if checking
// in-the-moment) -- callers evaluating a past cancellation should pass the
// stored cancelled_at, not the current time, since eligibility is fixed at
// the moment the customer (or staff) actually cancelled.
function isRefundEligible(bookingStartsAt, asOf = new Date()) {
  const startsAt = new Date(bookingStartsAt);
  const cutoff = new Date(asOf);

  return startsAt.getTime() - cutoff.getTime() >= REFUND_ELIGIBILITY_MS;
}

module.exports = {
  isRefundEligible,
  REFUND_ELIGIBILITY_HOURS,
};
