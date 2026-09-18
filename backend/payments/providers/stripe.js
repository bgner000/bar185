// Stripe Checkout for the A$10 booking deposit. Mirrors the same
// "not configured -> clean structured failure, never throw" contract used
// by notifications/providers/email.js and sms.js -- every exported
// function here returns { ok: true, ... } or { ok: false, error }, except
// constructWebhookEvent, which must throw on an invalid signature (that's
// the whole point of verifying it -- see its own comment).
//
// Uses the official `stripe` package rather than a bare fetch (unlike the
// email/SMS providers): Checkout Session creation and webhook signature
// verification are not simple enough to hand-roll safely, and Stripe's
// SDK is the standard way to do both correctly.
const Stripe = require('stripe');

let cachedClient = null;

function getClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new Stripe(secretKey);
  }

  return cachedClient;
}

async function createCheckoutSession({ amountCents, currency, bookingReference, customerEmail, successUrl, cancelUrl, expiresInSeconds }) {
  const stripe = getClient();

  if (!stripe) {
    return { ok: false, error: 'Deposit payments are not yet available (missing STRIPE_SECRET_KEY). Please choose email verification to secure your booking today.' };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amountCents,
            product_data: {
              name: 'Bar 185 Booking Deposit',
              description: `Refundable A$10 deposit -- reference ${bookingReference}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { bookingReference },
      // Stripe requires at least 30 minutes here regardless of how short
      // our own capacity hold is (see backend/bookings/holds.js) -- the
      // webhook's late-payment handling covers the gap between the two.
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return { ok: true, sessionId: session.id, url: session.url };
  } catch (error) {
    return { ok: false, error: error.message || 'Could not start the deposit payment.' };
  }
}

async function createRefund({ paymentIntentId }) {
  const stripe = getClient();

  if (!stripe) {
    return { ok: false, error: 'Refunds are not available (missing STRIPE_SECRET_KEY).' };
  }

  try {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
    return { ok: true, refundId: refund.id };
  } catch (error) {
    return { ok: false, error: error.message || 'Could not process the refund.' };
  }
}

// Throws on an invalid/unverifiable signature -- that failure IS the
// security boundary (an unverified body must never be treated as a real
// Stripe event), so unlike everything else in this file it does not
// return { ok: false } for that case. rawBody must be the exact,
// unparsed request body Stripe signed (see server.js's express.raw()
// middleware on this one route).
function constructWebhookEvent(rawBody, signature) {
  const stripe = getClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    throw new Error('Stripe webhook is not configured (missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET)');
  }

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

module.exports = {
  createCheckoutSession,
  createRefund,
  constructWebhookEvent,
};
