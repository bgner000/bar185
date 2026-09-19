const { createCheckoutSession, createRefund, constructWebhookEvent } = require('./providers/stripe');

// Single source of truth for the deposit amount and hold timing --
// referenced by server.js wherever a deposit booking is created or its
// hold is checked.
const DEPOSIT_AMOUNT_CENTS = 1000; // A$10
const DEPOSIT_CURRENCY = 'AUD';

// Our own capacity hold: how long a 'pending' booking keeps its seats
// before the sweep in backend/bookings/holds.js releases them.
const HOLD_DURATION_MINUTES = 10;

// Stripe Checkout Sessions require expires_at at least 30 minutes out
// (mode: 'payment') -- this is a hard Stripe minimum, not a choice made
// here. The Checkout page itself can therefore stay technically payable
// for longer than our own HOLD_DURATION_MINUTES; the webhook handles a
// payment that lands after our hold already released (see server.js).
const STRIPE_SESSION_EXPIRY_SECONDS = 30 * 60;

module.exports = {
  createCheckoutSession,
  createRefund,
  constructWebhookEvent,
  DEPOSIT_AMOUNT_CENTS,
  DEPOSIT_CURRENCY,
  HOLD_DURATION_MINUTES,
  STRIPE_SESSION_EXPIRY_SECONDS,
};
