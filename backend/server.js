const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('./db');
const notifications = require('./notifications');
const adminNotifications = require('./adminNotifications');
const verification = require('./verification');
const payments = require('./payments');
const { isRefundEligible } = require('./bookings/cancellationPolicy');
const { releaseExpiredHolds } = require('./bookings/holds');
const { normalizeAuMobile } = require('./notifications/phone');
const { saveMenuFile, deleteMenuFile, STORAGE_DIR, PUBLIC_PREFIX } = require('./menu/storage');

const app = express();
const PORT = 3000;

// Stripe requires the exact raw request body to verify a webhook's
// signature, so this route (and only this one) must be registered before
// the global express.json() below -- Express matches middleware/routes in
// registration order, so a request to this exact path never reaches the
// JSON parser. See backend/payments/providers/stripe.js for why an
// invalid signature throws rather than returning { ok: false }.
app.post(
  '/api/v1/payments/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    let event;

    try {
      event = payments.constructWebhookEvent(req.body, req.get('stripe-signature'));
    } catch (error) {
      console.error('Stripe webhook signature verification failed:', error.message);
      return res.status(400).send('Webhook signature verification failed');
    }

    try {
      if (event.type === 'checkout.session.completed') {
        await handleStripeCheckoutCompleted(event.data.object);
      } else if (event.type === 'checkout.session.expired') {
        await handleStripeCheckoutExpired(event.data.object);
      }
      // Any other event type is acknowledged without action -- Stripe only
      // sends what a webhook endpoint is subscribed to, and a 2xx here
      // stops Stripe from retrying something we don't need to handle.

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('Stripe webhook processing error:', error.message);

      // 5xx so Stripe retries the delivery -- safe to retry because both
      // handlers below re-check the booking's current status before
      // acting, so a retried (or duplicate) event can never re-confirm,
      // re-charge, or re-expire something already handled.
      return res.status(500).json({ status: 'failed' });
    }
  }
);

// Stripe is authoritative for payment success -- this is the ONLY place a
// deposit booking's status ever becomes 'confirmed'. The re-check of
// booking.status === 'pending' before acting is what makes a duplicate
// webhook delivery a no-op instead of a duplicate confirmation.
async function handleStripeCheckoutCompleted(session) {
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const bookingResult = await client.query(
      `
      SELECT id, status, booking_slot_id, party_size
      FROM bookings
      WHERE stripe_checkout_session_id = $1
      FOR UPDATE
      `,
      [session.id]
    );

    if (bookingResult.rowCount === 0) {
      // No booking recognises this session -- nothing this webhook can do.
      await client.query('ROLLBACK');
      return;
    }

    const booking = bookingResult.rows[0];

    if (booking.status !== 'pending') {
      await client.query('ROLLBACK');

      // The hold had already expired (or been paid by an earlier delivery
      // of this same event) by the time this arrived. If it expired, the
      // customer's card was still charged, so refund it immediately
      // rather than keep money for a booking that no longer exists --
      // capacity may already have gone to someone else, so the booking
      // can't be safely resurrected here.
      if (booking.status === 'cancelled') {
        const paymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

        if (paymentIntentId) {
          const refundResult = await payments.createRefund({ paymentIntentId });

          if (!refundResult.ok) {
            console.error('Auto-refund for a late payment on an expired hold failed:', refundResult.error);
          }
        }
      }

      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    const confirmedResult = await client.query(
      `
      UPDATE bookings
      SET
        status = 'confirmed',
        confirmed_at = NOW(),
        deposit_status = 'paid',
        stripe_payment_intent_id = $2,
        paid_at = NOW(),
        hold_expires_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id, booking_reference, booking_slot_id, party_size,
        customer_name, customer_email, customer_phone, special_requests
      `,
      [booking.id, paymentIntentId || null]
    );

    const slotResult = await client.query(
      `SELECT starts_at, ends_at FROM booking_slots WHERE id = $1`,
      [booking.booking_slot_id]
    );

    await client.query('COMMIT');

    await notifications.notifyBookingConfirmed(confirmedResult.rows[0], slotResult.rows[0]);
    await adminNotifications.notifyNewBooking(confirmedResult.rows[0], slotResult.rows[0]);
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Prompt cleanup for the common case (customer never paid, or abandoned
// checkout) -- the lazy sweep in backend/bookings/holds.js is the
// fallback for whenever this event doesn't arrive, but acting on it here
// releases the seats the moment Stripe tells us, not just whenever the
// next booking attempt on this slot happens to trigger the sweep.
async function handleStripeCheckoutExpired(session) {
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const bookingResult = await client.query(
      `
      SELECT id, status, booking_slot_id, party_size
      FROM bookings
      WHERE stripe_checkout_session_id = $1
      FOR UPDATE
      `,
      [session.id]
    );

    if (bookingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return;
    }

    const booking = bookingResult.rows[0];

    if (booking.status !== 'pending') {
      // Already confirmed (paid just before expiring) or already released
      // -- nothing to do.
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `
      UPDATE bookings
      SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancel_reason = 'Stripe checkout expired without payment',
        updated_at = NOW()
      WHERE id = $1
      `,
      [booking.id]
    );

    await client.query(
      `
      UPDATE booking_slots
      SET
        reserved_capacity = GREATEST(reserved_capacity - $1, 0),
        version_number = version_number + 1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [booking.party_size, booking.booking_slot_id]
    );

    await client.query('COMMIT');
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Attempts a real Stripe refund for an already-cancelled, refund-eligible
// deposit booking, and only then marks deposit_status = 'refunded' with a
// refunded_at timestamp. Always called after the cancellation itself has
// already committed (see both cancel routes below), so a slow or failed
// refund attempt never blocks or rolls back the actual table release --
// the booking stays cancelled and the seats stay freed either way; only
// the deposit's own status reflects whether money was really returned.
async function refundDepositIfEligible(booking) {
  if (!booking.stripe_payment_intent_id) {
    console.error(`Cannot refund booking ${booking.booking_reference}: no stripe_payment_intent_id on record`);
    return;
  }

  const refundResult = await payments.createRefund({ paymentIntentId: booking.stripe_payment_intent_id });

  if (!refundResult.ok) {
    console.error(`Refund failed for booking ${booking.booking_reference}:`, refundResult.error);
    return;
  }

  await pool.query(
    `UPDATE bookings SET deposit_status = 'refunded', refunded_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [booking.id]
  );
}

const menuUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, or PNG files are allowed'));
    }
  }
});

app.use(express.json());
app.use(cors());
app.use(PUBLIC_PREFIX, express.static(STORAGE_DIR));
const requireApprovedAdmin = async (req, res, next) => {
  const email = req.get('X-Demo-User-Email');

  if (!email) {
    return res.status(401).json({
      status: 'failed',
      message: 'Admin authentication required'
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.display_name,
        u.email,
        u.status AS user_status,
        sa.status AS staff_status,
        r.role_code
      FROM users u
      JOIN staff_accounts sa
        ON sa.user_id = u.id
      JOIN user_roles ur
        ON ur.user_id = u.id
      JOIN roles r
        ON r.id = ur.role_id
      WHERE LOWER(u.email) = LOWER($1)
        AND u.status = 'active'
        AND sa.status = 'approved'
        AND r.role_code = 'admin'
      LIMIT 1
      `,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(403).json({
        status: 'failed',
        message: 'Approved admin access required'
      });
    }

    req.adminUser = result.rows[0];
    next();
  } catch (error) {
    console.error('Admin authorization error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not verify admin access'
    });
  }
};


app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Bar 185 API'
  });
});

app.get('/api/v1/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS database_time');

    res.status(200).json({
      status: 'connected',
      database: 'PostgreSQL',
      databaseTime: result.rows[0].database_time
    });
  } catch (error) {
    console.error('Database connection error:', error.message);

    res.status(500).json({
      status: 'database connection failed'
    });
  }
});
app.get('/api/v1/booking-slots', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        bs.id,
        bs.starts_at,
        bs.ends_at,
        bs.total_capacity,
        bs.reserved_capacity,
        bs.is_open,
        v.venue_name
      FROM booking_slots bs
      JOIN venues v
        ON v.id = bs.venue_id
      WHERE bs.is_open = TRUE
        AND bs.starts_at > NOW()
      ORDER BY bs.starts_at ASC
    `);

    res.status(200).json({
      slots: result.rows
    });
  } catch (error) {
    console.error('Booking slots error:', error.message);

    res.status(500).json({
      status: 'failed',
      message: 'Could not load booking slots'
    });
  }
});
app.get('/api/v1/venue-hours', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        vh.day_of_week,
        vh.opens_at,
        vh.closes_at,
        vh.is_closed,
        v.timezone
      FROM venue_hours vh
      JOIN venues v
        ON v.id = vh.venue_id
      WHERE v.venue_reference = 'BAR185-MARRICKVILLE'
        AND v.is_active = TRUE
      ORDER BY vh.day_of_week ASC
    `);

    res.status(200).json({
      hours: result.rows
    });
  } catch (error) {
    console.error('Venue hours error:', error.message);

    res.status(500).json({
      status: 'failed',
      message: 'Could not load venue hours'
    });
  }
});

// Contact verification (OTP) for the booking flow -- a customer must prove
// control of the email or phone they're booking with before a table
// booking or large-group request can be created. See backend/verification
// for the full policy (expiry, attempts, rate limits, hashing).
app.post('/api/v1/verification/send', async (req, res) => {
  const { channel, email, phone } = req.body;

  const result = await verification.sendCode({ channel, email, phone, ipAddress: req.ip });

  if (!result.ok) {
    const responseBody = { status: 'failed', message: result.message };
    if (result.retryAfterSeconds) responseBody.retryAfterSeconds = result.retryAfterSeconds;
    return res.status(result.status).json(responseBody);
  }

  return res.status(201).json({
    status: 'ok',
    verificationId: result.verificationId,
    channel: result.channel,
    expiresInSeconds: result.expiresInSeconds,
    resendCooldownSeconds: result.resendCooldownSeconds
  });
});

app.post('/api/v1/verification/verify', async (req, res) => {
  const { verificationId, code } = req.body;

  const result = await verification.verifyCode({ verificationId, code });

  if (!result.ok) {
    return res.status(result.status).json({ status: 'failed', message: result.message });
  }

  return res.status(200).json({ status: 'verified' });
});

// Standard bookings secured by email verification. This is the original,
// pre-deposit booking route -- deposit bookings are a genuinely different
// lifecycle (a capacity hold + async Stripe Checkout + webhook
// confirmation, not a single request/response), so they're their own
// route below (POST /api/v1/bookings/deposit/start) rather than a branch
// bolted onto this one. Nothing about this route's behaviour has changed
// from before deposits existed, other than requiring the verification
// used specifically be an email one (see requiredChannel below).
app.post('/api/v1/bookings', async (req, res) => {
  const {
    bookingSlotId,
    partySize,
    customerName,
    customerEmail,
    customerPhone,
    specialRequests,
    verificationId
  } = req.body;

  const slotId = Number(bookingSlotId);
  const requestedPartySize = Number(partySize);

  if (
    !Number.isInteger(slotId) ||
    slotId < 1 ||
    !Number.isInteger(requestedPartySize) ||
    requestedPartySize < 1 ||
    typeof customerName !== 'string' ||
    customerName.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Valid booking slot, party size, customer name and email are required'
    });
  }

  let client;

  try {
    client = await pool.connect();

    await client.query('BEGIN');

    const slotResult = await client.query(
      `
      SELECT
        bs.id,
        bs.starts_at,
        bs.ends_at,
        bs.total_capacity,
        bs.reserved_capacity,
        bs.is_open,
        br.minimum_party_size,
        br.maximum_standard_party_size,
        br.large_group_threshold,
        br.booking_window_days
      FROM booking_slots bs
      JOIN booking_rules br
        ON br.venue_id = bs.venue_id
      WHERE bs.id = $1
      FOR UPDATE OF bs
      `,
      [slotId]
    );

    if (slotResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        status: 'failed',
        message: 'Booking slot not found'
      });
    }

    const slot = slotResult.rows[0];

    if (!slot.is_open) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'This booking slot is closed'
      });
    }

    const slotStart = new Date(slot.starts_at);
    const now = new Date();

    if (slotStart <= now) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'This booking slot is no longer available'
      });
    }

    const bookingWindowEnd = new Date(
      now.getTime() + Number(slot.booking_window_days) * 24 * 60 * 60 * 1000
    );

    if (slotStart > bookingWindowEnd) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: 'This booking is outside the permitted booking window'
      });
    }

    if (requestedPartySize < Number(slot.minimum_party_size)) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: `Minimum party size is ${slot.minimum_party_size}`
      });
    }

    if (
      requestedPartySize > Number(slot.maximum_standard_party_size) ||
      requestedPartySize >= Number(slot.large_group_threshold)
    ) {
      await client.query('ROLLBACK');

      return res.status(422).json({
        status: 'large_group_required',
        message: 'This party size requires a large-group booking request',
        nextEndpoint: '/api/v1/large-group-booking-requests'
      });
    }

    // Any deposit hold on this slot that timed out without payment is
    // released before capacity is evaluated, so a stale hold from an
    // abandoned Stripe Checkout never blocks a real (email-verified)
    // booking from taking those seats.
    await releaseExpiredHolds(client, slotId);

    const freshSlot = await client.query(
      `SELECT reserved_capacity FROM booking_slots WHERE id = $1`,
      [slotId]
    );

    const availableCapacity =
      Number(slot.total_capacity) - Number(freshSlot.rows[0].reserved_capacity);

    if (requestedPartySize > availableCapacity) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'Not enough capacity is available for this booking'
      });
    }

    // Checked (and consumed) only now that every other reason to reject
    // this request has already passed -- so a request that turns out to
    // need large-group review, or loses a capacity race, never wastes the
    // customer's verification on an attempt that was never going to book.
    // requiredChannel: 'email' means a phone (SMS) proof can't be
    // substituted here even though the underlying OTP endpoints still
    // support both channels generically -- large-group requests don't
    // pass this, and still accept either channel, unchanged.
    await verification.consumeVerification(client, {
      verificationId,
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone?.trim() || '',
      requiredChannel: 'email'
    });

    const bookingReference =
      'B185-' + crypto.randomBytes(5).toString('hex').toUpperCase();

    const bookingResult = await client.query(
      `
      INSERT INTO bookings (
        booking_reference,
        booking_slot_id,
        booking_type,
        status,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        special_requests,
        confirmed_at,
        booking_security_method,
        deposit_status
      )
      VALUES (
        $1,
        $2,
        'standard',
        'confirmed',
        $3,
        $4,
        $5,
        $6,
        $7,
        NOW(),
        'email_verification',
        'not_required'
      )
      RETURNING
        id,
        booking_reference,
        booking_slot_id,
        booking_type,
        status,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        special_requests,
        confirmed_at,
        created_at,
        booking_security_method,
        deposit_amount_cents,
        deposit_status
      `,
      [
        bookingReference,
        slotId,
        requestedPartySize,
        customerName.trim(),
        customerEmail.trim(),
        customerPhone?.trim() || null,
        specialRequests?.trim() || null
      ]
    );

    await client.query(
      `
      UPDATE booking_slots
      SET
        reserved_capacity = reserved_capacity + $1,
        version_number = version_number + 1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [requestedPartySize, slotId]
    );

    await client.query('COMMIT');

    await notifications.notifyBookingConfirmed(bookingResult.rows[0], slot);
    await adminNotifications.notifyNewBooking(bookingResult.rows[0], slot);

    return res.status(201).json({
      status: 'confirmed',
      booking: bookingResult.rows[0]
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    if (error instanceof verification.VerificationError) {
      return res.status(403).json({
        status: 'failed',
        message: error.message
      });
    }

    console.error('Create booking error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not create booking'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Starts a deposit-secured standard booking. This does NOT confirm a
// booking -- it validates exactly the same rules as POST /api/v1/bookings
// above (slot open, not in the past, within the booking window, party
// size, capacity), then holds the seats with a status = 'pending' row and
// hands back a Stripe Checkout URL. The booking only ever becomes
// 'confirmed' via the webhook below, once Stripe confirms payment really
// happened -- never from this endpoint returning successfully, and never
// just because the browser comes back to the success URL.
app.post('/api/v1/bookings/deposit/start', async (req, res) => {
  const { bookingSlotId, partySize, customerName, customerEmail, customerPhone, specialRequests } = req.body;

  const slotId = Number(bookingSlotId);
  const requestedPartySize = Number(partySize);

  if (
    !Number.isInteger(slotId) ||
    slotId < 1 ||
    !Number.isInteger(requestedPartySize) ||
    requestedPartySize < 1 ||
    typeof customerName !== 'string' ||
    customerName.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Valid booking slot, party size, customer name and email are required'
    });
  }

  const normalizedPhone = normalizeAuMobile(customerPhone);

  if (!normalizedPhone) {
    return res.status(400).json({
      status: 'failed',
      message: 'A valid Australian mobile number is required for the deposit option'
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Same slot/capacity checks as the email-verification booking route,
    // deliberately duplicated rather than shared -- this endpoint's
    // lifecycle (hold now, confirm later via webhook) is different enough
    // from a normal booking creation that large-group-booking-requests'
    // own fully-separate validation, not a shared helper, is the existing
    // pattern in this codebase to follow.
    const slotResult = await client.query(
      `
      SELECT
        bs.id,
        bs.starts_at,
        bs.ends_at,
        bs.total_capacity,
        bs.reserved_capacity,
        bs.is_open,
        br.minimum_party_size,
        br.maximum_standard_party_size,
        br.large_group_threshold,
        br.booking_window_days
      FROM booking_slots bs
      JOIN booking_rules br
        ON br.venue_id = bs.venue_id
      WHERE bs.id = $1
      FOR UPDATE OF bs
      `,
      [slotId]
    );

    if (slotResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        status: 'failed',
        message: 'Booking slot not found'
      });
    }

    const slot = slotResult.rows[0];

    if (!slot.is_open) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'This booking slot is closed'
      });
    }

    const slotStart = new Date(slot.starts_at);
    const now = new Date();

    if (slotStart <= now) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'This booking slot is no longer available'
      });
    }

    const bookingWindowEnd = new Date(
      now.getTime() + Number(slot.booking_window_days) * 24 * 60 * 60 * 1000
    );

    if (slotStart > bookingWindowEnd) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: 'This booking is outside the permitted booking window'
      });
    }

    if (requestedPartySize < Number(slot.minimum_party_size)) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: `Minimum party size is ${slot.minimum_party_size}`
      });
    }

    if (
      requestedPartySize > Number(slot.maximum_standard_party_size) ||
      requestedPartySize >= Number(slot.large_group_threshold)
    ) {
      await client.query('ROLLBACK');

      return res.status(422).json({
        status: 'large_group_required',
        message: 'This party size requires a large-group booking request',
        nextEndpoint: '/api/v1/large-group-booking-requests'
      });
    }

    await releaseExpiredHolds(client, slotId);

    const freshSlot = await client.query(
      `SELECT reserved_capacity FROM booking_slots WHERE id = $1`,
      [slotId]
    );

    const availableCapacity =
      Number(slot.total_capacity) - Number(freshSlot.rows[0].reserved_capacity);

    if (requestedPartySize > availableCapacity) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'Not enough capacity is available for this booking'
      });
    }

    const bookingReference =
      'B185-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    const holdExpiresAt = new Date(Date.now() + payments.HOLD_DURATION_MINUTES * 60 * 1000);

    const frontendOrigin = process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

    const checkoutResult = await payments.createCheckoutSession({
      amountCents: payments.DEPOSIT_AMOUNT_CENTS,
      currency: payments.DEPOSIT_CURRENCY,
      bookingReference,
      customerEmail: customerEmail.trim(),
      successUrl: `${frontendOrigin}/book?checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendOrigin}/book?depositCancelled=1`,
      expiresInSeconds: payments.STRIPE_SESSION_EXPIRY_SECONDS
    });

    if (!checkoutResult.ok) {
      await client.query('ROLLBACK');

      return res.status(502).json({
        status: 'failed',
        message: checkoutResult.error
      });
    }

    // The hold: seats are reserved right now, exactly like a confirmed
    // booking would reserve them, so a second customer can't also be
    // offered these seats while this one is at Stripe Checkout. Status
    // 'pending' (not 'confirmed') is what keeps it out of every view that
    // shows real bookings until the webhook says otherwise.
    await client.query(
      `
      INSERT INTO bookings (
        booking_reference,
        booking_slot_id,
        booking_type,
        status,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        special_requests,
        booking_security_method,
        deposit_amount_cents,
        deposit_status,
        stripe_checkout_session_id,
        hold_expires_at
      )
      VALUES (
        $1, $2, 'standard', 'pending', $3, $4, $5, $6, $7,
        'deposit', $8, 'pending', $9, $10
      )
      `,
      [
        bookingReference,
        slotId,
        requestedPartySize,
        customerName.trim(),
        customerEmail.trim(),
        normalizedPhone,
        specialRequests?.trim() || null,
        payments.DEPOSIT_AMOUNT_CENTS,
        checkoutResult.sessionId,
        holdExpiresAt.toISOString()
      ]
    );

    await client.query(
      `
      UPDATE booking_slots
      SET
        reserved_capacity = reserved_capacity + $1,
        version_number = version_number + 1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [requestedPartySize, slotId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      status: 'ok',
      bookingReference,
      checkoutUrl: checkoutResult.url
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    console.error('Start deposit booking error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not start the deposit payment'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Lets the frontend check what really happened after a customer returns
// from Stripe Checkout, instead of trusting the redirect URL alone (the
// webhook above is what actually confirms the booking; this just reports
// its current state). checkoutSessionId is the same high-entropy,
// Stripe-generated id already in the success/cancel URL, so no separate
// customer identity check is needed to look it up.
app.get('/api/v1/bookings/deposit/status', async (req, res) => {
  const { checkoutSessionId } = req.query;

  if (typeof checkoutSessionId !== 'string' || !checkoutSessionId.trim()) {
    return res.status(400).json({
      status: 'failed',
      message: 'checkoutSessionId is required'
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        b.booking_reference,
        b.status,
        b.deposit_status,
        b.deposit_amount_cents,
        b.party_size,
        bs.starts_at,
        bs.ends_at
      FROM bookings b
      JOIN booking_slots bs
        ON bs.id = b.booking_slot_id
      WHERE b.stripe_checkout_session_id = $1
      `,
      [checkoutSessionId.trim()]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: 'failed',
        message: 'No booking found for that checkout session'
      });
    }

    const booking = result.rows[0];

    return res.status(200).json({
      status: 'ok',
      bookingStatus: booking.status,
      depositStatus: booking.deposit_status,
      depositAmountCents: booking.deposit_amount_cents,
      bookingReference: booking.booking_reference,
      partySize: booking.party_size,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at
    });
  } catch (error) {
    console.error('Deposit status check error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not check payment status'
    });
  }
});

app.post('/api/v1/large-group-booking-requests', async (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key');

  const {
    bookingDate,
    slotStartAt,
    partySize,
    customerName,
    customerPhone,
    customerEmail,
    verificationId
  } = req.body;

  if (!idempotencyKey || idempotencyKey.trim() === '') {
    return res.status(400).json({
      status: 'failed',
      message: 'Idempotency-Key header is required'
    });
  }

  const requestedPartySize = Number(partySize);
  const slotStart = new Date(slotStartAt);

  if (
    typeof bookingDate !== 'string' ||
    bookingDate.trim() === '' ||
    Number.isNaN(slotStart.getTime()) ||
    !Number.isInteger(requestedPartySize) ||
    requestedPartySize < 1 ||
    typeof customerName !== 'string' ||
    customerName.trim() === '' ||
    typeof customerPhone !== 'string' ||
    customerPhone.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Valid booking date, start time, party size, name, phone and email are required'
    });
  }

  const requestPayload = {
    bookingDate,
    slotStartAt,
    partySize: requestedPartySize,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerEmail: customerEmail.trim(),
    verificationId
  };

  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(requestPayload))
    .digest('hex');

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [idempotencyKey]
    );

    const existingKey = await client.query(
      `
      SELECT
        request_hash,
        status,
        response_status_code,
        response_body
      FROM idempotency_keys
      WHERE idempotency_key = $1
      `,
      [idempotencyKey]
    );

    if (existingKey.rowCount > 0) {
      const existing = existingKey.rows[0];

      if (
        existing.request_hash &&
        existing.request_hash !== requestHash
      ) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: 'This Idempotency-Key was already used for a different request'
        });
      }

      if (existing.status === 'completed') {
        await client.query('COMMIT');

        return res
          .status(existing.response_status_code)
          .json(existing.response_body);
      }

      await client.query(
        `
        UPDATE idempotency_keys
        SET
          request_hash = $2,
          status = 'processing',
          updated_at = NOW()
        WHERE idempotency_key = $1
        `,
        [idempotencyKey, requestHash]
      );
    } else {
      await client.query(
        `
        INSERT INTO idempotency_keys (
          idempotency_key,
          request_method,
          request_path,
          request_hash,
          status,
          expires_at
        )
        VALUES (
          $1,
          'POST',
          '/api/v1/large-group-booking-requests',
          $2,
          'processing',
          NOW() + INTERVAL '24 hours'
        )
        `,
        [idempotencyKey, requestHash]
      );
    }

    const venueResult = await client.query(
      `
      SELECT
        v.id AS venue_id,
        br.large_group_threshold,
        br.booking_window_days
      FROM venues v
      JOIN booking_rules br
        ON br.venue_id = v.id
      WHERE v.venue_reference = 'BAR185-MARRICKVILLE'
        AND v.is_active = TRUE
      `
    );

    if (venueResult.rowCount === 0) {
      throw new Error('Venue or booking rules not configured');
    }

    const venue = venueResult.rows[0];

    if (
      requestedPartySize <
      Number(venue.large_group_threshold)
    ) {
      await client.query('ROLLBACK');

      return res.status(422).json({
        status: 'failed',
        message: `Large-group requests require at least ${venue.large_group_threshold} guests`
      });
    }

    const now = new Date();

    if (slotStart <= now) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: 'Requested booking time must be in the future'
      });
    }

    const bookingWindowEnd = new Date(
      now.getTime() +
        Number(venue.booking_window_days) *
          24 *
          60 *
          60 *
          1000
    );

    if (slotStart > bookingWindowEnd) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: 'Requested booking is outside the permitted booking window'
      });
    }

    // Same placement rule as the standard booking route: only once every
    // other reason to reject this request has passed, so a request that
    // fails validation never wastes the customer's verification.
    await verification.consumeVerification(client, {
      verificationId,
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim()
    });

    const requestReference =
      'B185-LG-' +
      crypto.randomBytes(5).toString('hex').toUpperCase();

    const requestResult = await client.query(
      `
      INSERT INTO large_group_booking_requests (
        request_reference,
        venue_id,
        booking_date,
        slot_start_at,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'pending'
      )
      RETURNING
        id,
        request_reference,
        booking_date,
        slot_start_at,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        status,
        created_at
      `,
      [
        requestReference,
        venue.venue_id,
        bookingDate,
        slotStartAt,
        requestedPartySize,
        customerName.trim(),
        customerEmail.trim(),
        customerPhone.trim()
      ]
    );

    const responseBody = {
      status: 'pending',
      message: 'Large-group booking request submitted for staff review',
      request: requestResult.rows[0]
    };

    await client.query(
      `
      UPDATE idempotency_keys
      SET
        status = 'completed',
        response_status_code = 201,
        response_body = $2::jsonb,
        updated_at = NOW()
      WHERE idempotency_key = $1
      `,
      [idempotencyKey, JSON.stringify(responseBody)]
    );

    await client.query('COMMIT');

    await notifications.notifyLargeGroupPending(requestResult.rows[0]);
    await adminNotifications.notifyLargeGroupRequest(requestResult.rows[0]);

    return res.status(201).json(responseBody);
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    if (error instanceof verification.VerificationError) {
      return res.status(403).json({
        status: 'failed',
        message: error.message
      });
    }

    console.error(
      'Large-group booking request error:',
      error.message
    );

    return res.status(500).json({
      status: 'failed',
      message: 'Could not submit large-group booking request'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});
app.post('/api/v1/event-enquiries', async (req, res) => {
  const {
    customerName,
    customerEmail,
    customerPhone,
    eventType,
    preferredStartAt,
    preferredEndAt,
    expectedGuestCount,
    message
  } = req.body;

  const guestCount = Number(expectedGuestCount);

  if (
    typeof customerName !== 'string' ||
    customerName.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === '' ||
    typeof message !== 'string' ||
    message.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Name, email and enquiry message are required'
    });
  }

  if (
    expectedGuestCount !== undefined &&
    expectedGuestCount !== null &&
    expectedGuestCount !== '' &&
    (!Number.isInteger(guestCount) || guestCount < 1)
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Expected guest count must be a positive whole number'
    });
  }

  if (
    preferredStartAt &&
    Number.isNaN(new Date(preferredStartAt).getTime())
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Preferred start time is invalid'
    });
  }

  if (
    preferredEndAt &&
    Number.isNaN(new Date(preferredEndAt).getTime())
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Preferred end time is invalid'
    });
  }

  if (
    preferredStartAt &&
    preferredEndAt &&
    new Date(preferredEndAt) <= new Date(preferredStartAt)
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Preferred end time must be after the start time'
    });
  }

  try {
    const enquiryReference =
      'B185-EQ-' +
      crypto.randomBytes(5).toString('hex').toUpperCase();

    const result = await pool.query(
      `
      INSERT INTO event_enquiries (
        enquiry_reference,
        customer_name,
        customer_email,
        customer_phone,
        event_type,
        preferred_start_at,
        preferred_end_at,
        expected_guest_count,
        message,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        'new'
      )
      RETURNING
        id,
        enquiry_reference,
        customer_name,
        customer_email,
        customer_phone,
        event_type,
        preferred_start_at,
        preferred_end_at,
        expected_guest_count,
        message,
        status,
        created_at
      `,
      [
        enquiryReference,
        customerName.trim(),
        customerEmail.trim(),
        customerPhone?.trim() || null,
        eventType?.trim() || null,
        preferredStartAt || null,
        preferredEndAt || null,
        expectedGuestCount === undefined ||
        expectedGuestCount === null ||
        expectedGuestCount === ''
          ? null
          : guestCount,
        message.trim()
      ]
    );

    await adminNotifications.notifyEventEnquiry(result.rows[0]);

    return res.status(201).json({
      status: 'submitted',
      message: 'Event enquiry submitted for staff review',
      enquiry: result.rows[0]
    });
  } catch (error) {
    console.error('Event enquiry error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not submit event enquiry'
    });
  }
});

app.get(
  '/api/v1/admin/dashboard',
  requireApprovedAdmin,
  async (req, res) => {
    try {
      const [
        bookingsResult,
        largeGroupsResult,
        enquiriesResult
      ] = await Promise.all([
        pool.query(`
          SELECT
            b.id,
            b.booking_reference,
            b.status,
            b.party_size,
            b.customer_name,
            b.customer_email,
            b.customer_phone,
            bs.starts_at,
            bs.ends_at
          FROM bookings b
          JOIN booking_slots bs
          ON bs.id = b.booking_slot_id
          WHERE b.status IN ('pending', 'confirmed')
          ORDER BY bs.starts_at ASC 
        `),

        pool.query(`
          SELECT
            id,
            request_reference,
            booking_date,
            slot_start_at,
            party_size,
            customer_name,
            customer_email,
            customer_phone,
            status,
            decline_reason,
            reviewed_at,
            created_at
          FROM large_group_booking_requests
          ORDER BY created_at DESC
        `),

        pool.query(`
          SELECT
            id,
            enquiry_reference,
            customer_name,
            customer_email,
            customer_phone,
            event_type,
            preferred_start_at,
            preferred_end_at,
            expected_guest_count,
            message,
            status,
            created_at
          FROM event_enquiries
          ORDER BY created_at DESC
        `)
      ]);

      return res.status(200).json({
        status: 'ok',
        admin: {
          id: req.adminUser.id,
          displayName: req.adminUser.display_name,
          role: req.adminUser.role_code
        },
        dashboard: {
          bookings: bookingsResult.rows,
          largeGroupRequests: largeGroupsResult.rows,
          eventEnquiries: enquiriesResult.rows
        }
      });
    } catch (error) {
      console.error('Admin dashboard error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load admin dashboard'
      });
    }
  }
);

// Admin notification centre (the header bell). Newest first, capped at a
// sane limit so a long-running venue can never return an unbounded list.
// unreadCount is computed alongside the page itself (not derived from it
// client-side) so it stays correct even when the page is capped below the
// true unread total.
app.get(
  '/api/v1/admin/notifications',
  requireApprovedAdmin,
  async (req, res) => {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 30;

    try {
      const [listResult, unreadResult] = await Promise.all([
        pool.query(
          `
          SELECT id, type, title, message, entity_type, entity_id, metadata, is_read, read_at, created_at
          FROM admin_notifications
          ORDER BY created_at DESC
          LIMIT $1
          `,
          [limit]
        ),
        pool.query(`SELECT COUNT(*)::int AS count FROM admin_notifications WHERE is_read = FALSE`)
      ]);

      return res.status(200).json({
        notifications: listResult.rows,
        unreadCount: unreadResult.rows[0].count
      });
    } catch (error) {
      console.error('Admin notifications list error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load notifications'
      });
    }
  }
);

app.patch(
  '/api/v1/admin/notifications/read-all',
  requireApprovedAdmin,
  async (req, res) => {
    try {
      await pool.query(
        `UPDATE admin_notifications SET is_read = TRUE, read_at = COALESCE(read_at, NOW()) WHERE is_read = FALSE`
      );

      return res.status(200).json({ status: 'ok', unreadCount: 0 });
    } catch (error) {
      console.error('Admin notifications mark-all-read error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not mark notifications as read'
      });
    }
  }
);

app.patch(
  '/api/v1/admin/notifications/:id/read',
  requireApprovedAdmin,
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        status: 'failed',
        message: 'Invalid notification id'
      });
    }

    try {
      await pool.query(
        `UPDATE admin_notifications SET is_read = TRUE, read_at = COALESCE(read_at, NOW()) WHERE id = $1`,
        [id]
      );

      const unreadResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM admin_notifications WHERE is_read = FALSE`
      );

      return res.status(200).json({ status: 'ok', unreadCount: unreadResult.rows[0].count });
    } catch (error) {
      console.error('Admin notification mark-read error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not mark notification as read'
      });
    }
  }
);
app.patch('/api/v1/bookings/:bookingReference/cancel', async (req, res) => {
  const { bookingReference } = req.params;
  const { customerEmail } = req.body;

  if (
    typeof bookingReference !== 'string' ||
    bookingReference.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Booking reference and customer email are required'
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const bookingResult = await client.query(
      `
      SELECT
        b.id,
        b.booking_reference,
        b.booking_slot_id,
        b.party_size,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.status,
        b.deposit_status,
        b.stripe_payment_intent_id,
        bs.starts_at
      FROM bookings b
      JOIN booking_slots bs
        ON bs.id = b.booking_slot_id
      WHERE b.booking_reference = $1
      FOR UPDATE OF b
      `,
      [bookingReference.trim()]
    );

    if (bookingResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        status: 'failed',
        message: 'Booking not found'
      });
    }

    const booking = bookingResult.rows[0];

    if (
      booking.customer_email.toLowerCase() !==
      customerEmail.trim().toLowerCase()
    ) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        status: 'failed',
        message: 'Booking not found'
      });
    }

    if (booking.status === 'cancelled') {
      await client.query('COMMIT');

      return res.status(200).json({
        status: 'cancelled',
        message: 'Booking is already cancelled',
        bookingReference: booking.booking_reference
      });
    }

    if (booking.status !== 'confirmed') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: `Booking cannot be cancelled from status ${booking.status}`
      });
    }

    await client.query(
      `
      UPDATE booking_slots
      SET
        reserved_capacity =
          GREATEST(reserved_capacity - $1, 0),
        version_number = version_number + 1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [
        booking.party_size,
        booking.booking_slot_id
      ]
    );

    await client.query(
      `
      DELETE FROM booking_table_allocations
      WHERE booking_id = $1
      `,
      [booking.id]
    );

    // A paid deposit is either 'retained' (< 12 hours' notice -- no
    // payment action needed, the money simply isn't returned) or left as
    // 'paid' here and refunded for real just below once this transaction
    // has committed -- never flipped straight to 'refunded' inside this
    // update, since that would claim money moved before Stripe has
    // actually confirmed it did.
    const isPaidDeposit = booking.deposit_status === 'paid';
    const refundEligible = isPaidDeposit && isRefundEligible(booking.starts_at, new Date());
    const depositRetained = isPaidDeposit && !refundEligible;

    // cancelled_at wasn't previously set by this customer-facing route
    // (only the admin cancel path set it) -- now needed so the admin
    // "Refund eligible" display can tell exactly when this cancellation
    // happened, same as it already could for admin-initiated cancellations.
    await client.query(
      `
      UPDATE bookings
      SET
        status = 'cancelled',
        cancelled_at = NOW(),
        deposit_status = CASE WHEN $2 THEN 'retained'::deposit_status ELSE deposit_status END,
        updated_at = NOW()
      WHERE id = $1
      `,
      [booking.id, depositRetained]
    );

    await client.query('COMMIT');

    await notifications.notifyBookingCancelled(booking);
    await adminNotifications.notifyBookingCancelled(booking);

    if (refundEligible) {
      await refundDepositIfEligible(booking);
    }

    return res.status(200).json({
      status: 'cancelled',
      message: 'Booking cancelled successfully',
      bookingReference: booking.booking_reference
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    console.error('Cancel booking error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not cancel booking'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});
app.patch(
  '/api/v1/admin/large-group-booking-requests/:requestReference/approve',
  requireApprovedAdmin,
  async (req, res) => {
    const { requestReference } = req.params;

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const requestResult = await client.query(
        `
        SELECT
          id,
          request_reference,
          venue_id,
          slot_start_at,
          party_size,
          customer_name,
          customer_email,
          customer_phone,
          status,
          approved_booking_id
        FROM large_group_booking_requests
        WHERE request_reference = $1
        FOR UPDATE
        `,
        [requestReference]
      );

      if (requestResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Large-group request not found'
        });
      }

      const request = requestResult.rows[0];

      if (
        request.status === 'confirmed' &&
        request.approved_booking_id
      ) {
        const existingBooking = await client.query(
          `
          SELECT
            id,
            booking_reference,
            status,
            party_size
          FROM bookings
          WHERE id = $1
          `,
          [request.approved_booking_id]
        );

        await client.query('COMMIT');

        return res.status(200).json({
          status: 'confirmed',
          message: 'Large-group request is already approved',
          booking: existingBooking.rows[0]
        });
      }

      if (request.status !== 'pending') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Request cannot be approved from status ${request.status}`
        });
      }

      const slotResult = await client.query(
        `
        SELECT
          id,
          starts_at,
          ends_at,
          total_capacity,
          reserved_capacity,
          is_open
        FROM booking_slots
        WHERE venue_id = $1
          AND starts_at = $2
        ORDER BY ends_at ASC
        LIMIT 1
        FOR UPDATE
        `,
        [
          request.venue_id,
          request.slot_start_at
        ]
      );

      if (slotResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: 'Matching booking slot is no longer available'
        });
      }

      const slot = slotResult.rows[0];

      if (!slot.is_open) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: 'Booking slot is closed'
        });
      }

      const availableCapacity =
        Number(slot.total_capacity) -
        Number(slot.reserved_capacity);

      if (Number(request.party_size) > availableCapacity) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Insufficient capacity. Only ${availableCapacity} seats remain`
        });
      }

      const bookingReference =
        'B185-' +
        crypto.randomBytes(5).toString('hex').toUpperCase();

      const bookingResult = await client.query(
        `
        INSERT INTO bookings (
          booking_reference,
          booking_slot_id,
          booking_type,
          status,
          party_size,
          customer_name,
          customer_email,
          customer_phone,
          special_requests,
          reviewed_by_user_id,
          confirmed_at
        )
        VALUES (
          $1,
          $2,
          'large_group',
          'confirmed',
          $3,
          $4,
          $5,
          $6,
          NULL,
          $7,
          NOW()
        )
        RETURNING
          id,
          booking_reference,
          booking_slot_id,
          booking_type,
          status,
          party_size,
          customer_name,
          customer_email,
          customer_phone,
          confirmed_at,
          created_at
        `,
        [
          bookingReference,
          slot.id,
          request.party_size,
          request.customer_name,
          request.customer_email,
          request.customer_phone,
          req.adminUser.id
        ]
      );

      await client.query(
        `
        UPDATE booking_slots
        SET
          reserved_capacity =
            reserved_capacity + $1,
          version_number =
            version_number + 1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          request.party_size,
          slot.id
        ]
      );

      await client.query(
        `
        UPDATE large_group_booking_requests
        SET
          status = 'confirmed',
          reviewed_by_user_id = $1,
          approved_booking_id = $2,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          req.adminUser.id,
          bookingResult.rows[0].id,
          request.id
        ]
      );

      await client.query('COMMIT');

      await notifications.notifyBookingConfirmed(bookingResult.rows[0], slot);

      return res.status(200).json({
        status: 'confirmed',
        message: 'Large-group booking approved',
        booking: bookingResult.rows[0]
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error(
        'Approve large-group request error:',
        error.message
      );

      return res.status(500).json({
        status: 'failed',
        message: 'Could not approve large-group request'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

app.patch(
  '/api/v1/admin/large-group-booking-requests/:requestReference/decline',
  requireApprovedAdmin,
  async (req, res) => {
    const { requestReference } = req.params;
    const { reason } = req.body;

    if (typeof reason !== 'string' || reason.trim() === '') {
      return res.status(400).json({
        status: 'failed',
        message: 'A decline reason is required'
      });
    }

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const requestResult = await client.query(
        `
        SELECT
          id,
          request_reference,
          status,
          customer_name,
          customer_email,
          customer_phone,
          decline_reason
        FROM large_group_booking_requests
        WHERE request_reference = $1
        FOR UPDATE
        `,
        [requestReference]
      );

      if (requestResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Large-group request not found'
        });
      }

      const request = requestResult.rows[0];

      if (request.status === 'declined') {
        await client.query('COMMIT');

        return res.status(200).json({
          status: 'declined',
          message: 'Large-group request is already declined',
          requestReference: request.request_reference
        });
      }

      if (request.status !== 'pending') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Request cannot be declined from status ${request.status}`
        });
      }

      await client.query(
        `
        UPDATE large_group_booking_requests
        SET
          status = 'declined',
          reviewed_by_user_id = $1,
          reviewed_at = NOW(),
          decline_reason = $3,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          req.adminUser.id,
          request.id,
          reason.trim()
        ]
      );

      await client.query('COMMIT');

      await notifications.notifyLargeGroupDeclined({ ...request, decline_reason: reason.trim() });

      return res.status(200).json({
        status: 'declined',
        message: 'Large-group booking request declined',
        requestReference: request.request_reference
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error(
        'Decline large-group request error:',
        error.message
      );

      return res.status(500).json({
        status: 'failed',
        message: 'Could not decline large-group request'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
); 
app.patch(
  '/api/v1/admin/event-enquiries/:enquiryReference/status',
  requireApprovedAdmin,
  async (req, res) => {
    const { enquiryReference } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      'acknowledged',
      'in_review',
      'contacted',
      'quoted',
      'closed',
      'declined'
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        status: 'failed',
        message: 'Invalid event enquiry status',
        allowedStatuses
      });
    }

    try {
      const result = await pool.query(
        `
        UPDATE event_enquiries
        SET
          status = $1,
          assigned_to_user_id = COALESCE(
            assigned_to_user_id,
            $2
          ),
          reviewed_at = COALESCE(
            reviewed_at,
            NOW()
          ),
          updated_at = NOW()
        WHERE enquiry_reference = $3
        RETURNING
          id,
          enquiry_reference,
          customer_name,
          customer_email,
          customer_phone,
          event_type,
          preferred_start_at,
          preferred_end_at,
          expected_guest_count,
          message,
          status,
          assigned_to_user_id,
          reviewed_at,
          created_at,
          updated_at
        `,
        [
          status,
          req.adminUser.id,
          enquiryReference
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          status: 'failed',
          message: 'Event enquiry not found'
        });
      }

      return res.status(200).json({
        status: 'ok',
        message: 'Event enquiry status updated',
        enquiry: result.rows[0]
      });

    } catch (error) {
      console.error(
        'Update event enquiry status error:',
        error.message
      );

      return res.status(500).json({
        status: 'failed',
        message: 'Could not update event enquiry status'
      });
    }
  }
);

app.get(
  '/api/v1/admin/bookings',
  requireApprovedAdmin,
  async (req, res) => {
    const { date } = req.query;
    const serviceDate = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : null;

    if (!serviceDate) {
      return res.status(400).json({
        status: 'failed',
        message: 'A date query parameter (YYYY-MM-DD) is required'
      });
    }

    try {
      const result = await pool.query(
        `
        SELECT
          b.id,
          b.booking_reference,
          b.booking_type,
          b.status,
          b.party_size,
          b.customer_name,
          b.customer_email,
          b.customer_phone,
          b.special_requests,
          b.seated_at,
          b.completed_at,
          b.no_show_at,
          b.cancelled_at,
          b.cancel_reason,
          b.booking_security_method,
          b.deposit_amount_cents,
          b.deposit_status,
          b.payment_provider_reference,
          b.stripe_checkout_session_id,
          b.stripe_payment_intent_id,
          b.paid_at,
          b.refunded_at,
          bs.starts_at,
          bs.ends_at
        FROM bookings b
        JOIN booking_slots bs
          ON bs.id = b.booking_slot_id
        WHERE bs.starts_at >= ($1::date)::timestamp AT TIME ZONE 'Australia/Sydney'
          AND bs.starts_at < ($1::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Australia/Sydney'
        ORDER BY bs.starts_at ASC
        `,
        [serviceDate]
      );

      // A paid deposit cancelled with >=12 hours' notice stays stored as
      // 'paid' (see the cancel routes) until a real refund is processed --
      // this derives the "Refund eligible" admin display from that same
      // rule rather than storing a value that would need to change again
      // once refunds are real.
      const bookings = result.rows.map((row) => ({
        ...row,
        deposit_refund_eligible:
          row.status === 'cancelled' &&
          row.deposit_status === 'paid' &&
          row.cancelled_at !== null &&
          isRefundEligible(row.starts_at, row.cancelled_at)
      }));

      return res.status(200).json({
        status: 'ok',
        serviceDate,
        bookings
      });
    } catch (error) {
      console.error('Admin bookings-by-date error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load bookings for that date'
      });
    }
  }
);

// Looks up one booking by its reference regardless of date -- what the
// admin notification bell's "deep link" uses to find which service date a
// notified booking belongs to before switching the Bookings page there.
// Same row shape (and the same deposit_refund_eligible derivation) as the
// date-scoped list above, just filtered by reference instead of a day.
app.get(
  '/api/v1/admin/bookings/:bookingReference',
  requireApprovedAdmin,
  async (req, res) => {
    const { bookingReference } = req.params;

    try {
      const result = await pool.query(
        `
        SELECT
          b.id,
          b.booking_reference,
          b.booking_type,
          b.status,
          b.party_size,
          b.customer_name,
          b.customer_email,
          b.customer_phone,
          b.special_requests,
          b.seated_at,
          b.completed_at,
          b.no_show_at,
          b.cancelled_at,
          b.cancel_reason,
          b.booking_security_method,
          b.deposit_amount_cents,
          b.deposit_status,
          b.payment_provider_reference,
          b.stripe_checkout_session_id,
          b.stripe_payment_intent_id,
          b.paid_at,
          b.refunded_at,
          bs.starts_at,
          bs.ends_at
        FROM bookings b
        JOIN booking_slots bs
          ON bs.id = b.booking_slot_id
        WHERE b.booking_reference = $1
        `,
        [bookingReference.trim()]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          status: 'failed',
          message: 'Booking not found'
        });
      }

      const row = result.rows[0];

      const booking = {
        ...row,
        deposit_refund_eligible:
          row.status === 'cancelled' &&
          row.deposit_status === 'paid' &&
          row.cancelled_at !== null &&
          isRefundEligible(row.starts_at, row.cancelled_at)
      };

      return res.status(200).json({ status: 'ok', booking });
    } catch (error) {
      console.error('Admin booking-by-reference error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load that booking'
      });
    }
  }
);

// Booking operational status transitions staff may perform from the admin
// dashboard. Anything not listed here (e.g. leaving 'cancelled' or
// 'no_show') is a dead end -- enforced here, not just by hiding buttons in
// the UI, since the frontend hiding a control is not a security boundary.
// 'seated' -> 'confirmed' and 'completed' -> 'seated' are the staff-facing
// "Undo" actions -- deliberately one step back only, not a general reopen
// (cancelled/no_show/completed -> confirmed stay unreachable here).
const ADMIN_BOOKING_TRANSITIONS = {
  confirmed: ['seated', 'no_show', 'cancelled'],
  seated: ['completed', 'confirmed'],
  completed: ['seated']
};

app.patch(
  '/api/v1/admin/bookings/:bookingReference/status',
  requireApprovedAdmin,
  async (req, res) => {
    const { bookingReference } = req.params;
    const { status: nextStatus, reason } = req.body;

    const validTargets = ['confirmed', 'seated', 'completed', 'no_show', 'cancelled'];

    if (!validTargets.includes(nextStatus)) {
      return res.status(400).json({
        status: 'failed',
        message: 'Invalid target status'
      });
    }

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const bookingResult = await client.query(
        `
        SELECT
          b.id,
          b.booking_reference,
          b.booking_slot_id,
          b.party_size,
          b.status,
          b.customer_name,
          b.customer_email,
          b.customer_phone,
          b.deposit_status,
          b.stripe_payment_intent_id,
          bs.starts_at
        FROM bookings b
        JOIN booking_slots bs
          ON bs.id = b.booking_slot_id
        WHERE b.booking_reference = $1
        FOR UPDATE OF b
        `,
        [bookingReference.trim()]
      );

      if (bookingResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Booking not found'
        });
      }

      const booking = bookingResult.rows[0];
      const allowedNext = ADMIN_BOOKING_TRANSITIONS[booking.status] || [];

      if (!allowedNext.includes(nextStatus)) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Booking cannot move from ${booking.status} to ${nextStatus}`
        });
      }

      if (nextStatus === 'no_show') {
        const eligibleAt = new Date(
          new Date(booking.starts_at).getTime() + 30 * 60 * 1000
        );

        if (new Date() < eligibleAt) {
          await client.query('ROLLBACK');

          return res.status(409).json({
            status: 'failed',
            message: `This booking can only be marked no-show from ${eligibleAt.toISOString()}`
          });
        }
      }

      if (nextStatus === 'cancelled' || nextStatus === 'no_show') {
        await client.query(
          `
          UPDATE booking_slots
          SET
            reserved_capacity = GREATEST(reserved_capacity - $1, 0),
            version_number = version_number + 1,
            updated_at = NOW()
          WHERE id = $2
          `,
          [booking.party_size, booking.booking_slot_id]
        );

        await client.query(
          `DELETE FROM booking_table_allocations WHERE booking_id = $1`,
          [booking.id]
        );
      }

      if (nextStatus === 'seated' && booking.status === 'completed') {
        // Undo Completed: the party is seated again, so seated_at (when they
        // were first seated) is preserved -- only completed_at clears.
        await client.query(
          `UPDATE bookings SET status = 'seated', completed_at = NULL, updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'seated') {
        await client.query(
          `UPDATE bookings SET status = 'seated', seated_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'confirmed') {
        // Undo Seated: the reservation itself never stopped existing, so
        // this just clears seated_at rather than touching booking_slots.
        await client.query(
          `UPDATE bookings SET status = 'confirmed', seated_at = NULL, updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'completed') {
        await client.query(
          `UPDATE bookings SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'no_show') {
        // A no-show always retains the deposit -- unlike a cancellation,
        // there's no 12-hour-notice question to evaluate.
        await client.query(
          `
          UPDATE bookings
          SET
            status = 'no_show',
            no_show_at = NOW(),
            deposit_status = CASE WHEN deposit_status = 'paid' THEN 'retained'::deposit_status ELSE deposit_status END,
            updated_at = NOW()
          WHERE id = $1
          `,
          [booking.id]
        );
      }

      // Computed before the branch below runs so it's available after
      // COMMIT for the actual refund attempt, same placement rule as the
      // customer-facing cancel route.
      let refundEligible = false;

      if (nextStatus === 'cancelled') {
        // Same rule (and same "never auto-set 'refunded'") as the
        // customer-facing cancel route -- see its comment for why.
        const isPaidDeposit = booking.deposit_status === 'paid';
        refundEligible = isPaidDeposit && isRefundEligible(booking.starts_at, new Date());
        const depositRetained = isPaidDeposit && !refundEligible;

        await client.query(
          `
          UPDATE bookings
          SET
            status = 'cancelled',
            cancelled_at = NOW(),
            cancelled_by_user_id = $2,
            cancel_reason = $3,
            deposit_status = CASE WHEN $4 THEN 'retained'::deposit_status ELSE deposit_status END,
            updated_at = NOW()
          WHERE id = $1
          `,
          [
            booking.id,
            req.adminUser.id,
            typeof reason === 'string' && reason.trim() ? reason.trim() : null,
            depositRetained
          ]
        );
      }

      await client.query('COMMIT');

      if (nextStatus === 'cancelled') {
        await notifications.notifyBookingCancelled(booking);

        if (refundEligible) {
          await refundDepositIfEligible(booking);
        }
      }

      return res.status(200).json({
        status: 'ok',
        message: `Booking updated to ${nextStatus}`,
        bookingReference: booking.booking_reference
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Admin booking status update error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not update booking status'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// Best-effort display title for a page that was never given one explicitly
// (an original upload, or one migrated from the old single-file
// menu_documents system, which had no title concept at all). Never
// written to the database -- computed fresh on every response, so
// changing this logic later needs no backfill.
function deriveMenuPageTitle(fileName, sortOrder) {
  const base = String(fileName || '').replace(/\.[^./]+$/, '');
  const cleaned = base
    .replace(/^bar[-_ ]?185[-_ ]?menu[-_ ]?/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (!cleaned) return `Menu Page ${sortOrder}`;

  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toMenuPageResponse(row) {
  return {
    // BIGINT columns come back from `pg` as strings (precision safety) --
    // cast here so every id this API hands out is a plain number, since
    // the reorder route's { pageIds: [...] } contract expects one.
    id: Number(row.id),
    sortOrder: row.sort_order,
    title: row.title || deriveMenuPageTitle(row.file_name, row.sort_order),
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    url: `${PUBLIC_PREFIX}/${row.storage_path}`,
    createdAt: row.created_at
  };
}

// Row-locks the venue's published version (if one exists) so a concurrent
// add-page request can't compute the same "next sort_order" twice.
async function getOrCreatePublishedMenuVersion(client, venueId, uploadedByUserId) {
  const existing = await client.query(
    `SELECT id FROM menu_versions WHERE venue_id = $1 AND status = 'published' FOR UPDATE`,
    [venueId]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0].id;
  }

  const created = await client.query(
    `
    INSERT INTO menu_versions (venue_id, status, published_at, uploaded_by_user_id)
    VALUES ($1, 'published', NOW(), $2)
    RETURNING id
    `,
    [venueId, uploadedByUserId]
  );

  return created.rows[0].id;
}

// Re-numbers a version's pages to a contiguous 1..N run, in their current
// relative order. Used after a delete (which leaves a gap) so ordering
// stays a clean sequence. Goes through a large temporary offset first --
// updating straight to final values one row at a time would collide with
// uq_menu_page_version_sort_order the moment two rows' target values cross.
async function resequenceMenuPages(client, menuVersionId) {
  await client.query(
    `UPDATE menu_pages SET sort_order = sort_order + 100000 WHERE menu_version_id = $1`,
    [menuVersionId]
  );

  await client.query(
    `
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) AS rn
      FROM menu_pages
      WHERE menu_version_id = $1
    )
    UPDATE menu_pages mp
    SET sort_order = ranked.rn, updated_at = NOW()
    FROM ranked
    WHERE mp.id = ranked.id
    `,
    [menuVersionId]
  );
}

// Public menu: every page of the venue's published version, in order. A
// published version with zero pages (the last page was just deleted) is
// reported the same as no version at all -- there's nothing for the
// existing "menu not published yet" empty state to distinguish.
app.get('/api/v1/menu', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT mp.id, mp.sort_order, mp.title, mp.file_name, mp.storage_path, mp.mime_type, mp.file_size_bytes, mp.created_at
      FROM menu_pages mp
      JOIN menu_versions mv
        ON mv.id = mp.menu_version_id
      JOIN venues v
        ON v.id = mv.venue_id
      WHERE v.venue_reference = 'BAR185-MARRICKVILLE'
        AND mv.status = 'published'
      ORDER BY mp.sort_order ASC
    `);

    if (result.rowCount === 0) {
      return res.status(200).json({ menu: null });
    }

    return res.status(200).json({
      menu: {
        pages: result.rows.map(toMenuPageResponse)
      }
    });
  } catch (error) {
    console.error('Get public menu error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not load menu'
    });
  }
});

// Admin menu screen: the published version's pages (what "+ Add Menu
// Page", Replace/Move/Delete all act on) plus prior menu_documents-era
// uploads, each preserved as its own one-page archived version.
app.get(
  '/api/v1/admin/menu',
  requireApprovedAdmin,
  async (req, res) => {
    try {
      const versionsResult = await pool.query(`
        SELECT mv.id, mv.status, mv.published_at, mv.created_at, u.display_name AS uploaded_by_name
        FROM menu_versions mv
        JOIN venues v
          ON v.id = mv.venue_id
        LEFT JOIN users u
          ON u.id = mv.uploaded_by_user_id
        WHERE v.venue_reference = 'BAR185-MARRICKVILLE'
        ORDER BY COALESCE(mv.published_at, mv.created_at) DESC
      `);

      const versionIds = versionsResult.rows.map((row) => row.id);

      const pagesResult = versionIds.length
        ? await pool.query(
            `
            SELECT id, menu_version_id, sort_order, title, file_name, storage_path, mime_type, file_size_bytes, created_at
            FROM menu_pages
            WHERE menu_version_id = ANY($1::bigint[])
            ORDER BY sort_order ASC
            `,
            [versionIds]
          )
        : { rows: [] };

      const pagesByVersion = new Map();
      for (const page of pagesResult.rows) {
        if (!pagesByVersion.has(page.menu_version_id)) pagesByVersion.set(page.menu_version_id, []);
        pagesByVersion.get(page.menu_version_id).push(toMenuPageResponse(page));
      }

      const versions = versionsResult.rows.map((row) => ({
        id: row.id,
        status: row.status,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        uploadedByName: row.uploaded_by_name || 'Unknown',
        pages: pagesByVersion.get(row.id) || []
      }));

      const version = versions.find((v) => v.status === 'published') || null;
      const history = versions.filter((v) => v.status !== 'published');

      return res.status(200).json({ status: 'ok', version, history });
    } catch (error) {
      console.error('Admin menu list error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load menu documents'
      });
    }
  }
);

// Adds a new page to the end of the published menu without touching any
// existing page -- this (not replacing the single menu_documents row) is
// the fix for uploading a second file wiping out the first.
app.post(
  '/api/v1/admin/menu/pages',
  requireApprovedAdmin,
  menuUpload.single('pageFile'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        status: 'failed',
        message: 'A page file (PDF, JPG, or PNG) is required'
      });
    }

    const title = typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim() : null;

    let client;

    try {
      const { storagePath } = saveMenuFile(req.file.buffer, req.file.mimetype);

      client = await pool.connect();
      await client.query('BEGIN');

      const venueResult = await client.query(
        `SELECT id FROM venues WHERE venue_reference = 'BAR185-MARRICKVILLE'`
      );
      const venueId = venueResult.rows[0].id;

      const menuVersionId = await getOrCreatePublishedMenuVersion(client, venueId, req.adminUser.id);

      const nextSortOrderResult = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM menu_pages WHERE menu_version_id = $1`,
        [menuVersionId]
      );
      const nextSortOrder = nextSortOrderResult.rows[0].next_sort_order;

      const insertResult = await client.query(
        `
        INSERT INTO menu_pages (
          menu_version_id, sort_order, title, file_name, storage_path, mime_type, file_size_bytes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, sort_order, title, file_name, storage_path, mime_type, file_size_bytes, created_at
        `,
        [menuVersionId, nextSortOrder, title, req.file.originalname, storagePath, req.file.mimetype, req.file.size]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        status: 'ok',
        message: 'Menu page added',
        page: toMenuPageResponse(insertResult.rows[0])
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Add menu page error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not add menu page'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// Persists a new page order for the published version. Registered before
// the /:id PATCH below on purpose -- Express matches routes in
// registration order, and :id would otherwise greedily match the literal
// path segment "reorder" here.
app.patch(
  '/api/v1/admin/menu/pages/reorder',
  requireApprovedAdmin,
  async (req, res) => {
    const { pageIds } = req.body;

    if (!Array.isArray(pageIds) || pageIds.length === 0 || !pageIds.every((id) => Number.isInteger(id))) {
      return res.status(400).json({ status: 'failed', message: 'pageIds must be a non-empty array of ids' });
    }

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const venueResult = await client.query(
        `SELECT id FROM venues WHERE venue_reference = 'BAR185-MARRICKVILLE'`
      );
      const venueId = venueResult.rows[0].id;

      const versionResult = await client.query(
        `SELECT id FROM menu_versions WHERE venue_id = $1 AND status = 'published' FOR UPDATE`,
        [venueId]
      );

      if (versionResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({ status: 'failed', message: 'No published menu to reorder' });
      }

      const menuVersionId = versionResult.rows[0].id;

      const currentPages = await client.query(
        `SELECT id FROM menu_pages WHERE menu_version_id = $1 FOR UPDATE`,
        [menuVersionId]
      );

      const currentIds = new Set(currentPages.rows.map((row) => Number(row.id)));
      const submittedIds = new Set(pageIds);

      const isSameSet =
        currentIds.size === submittedIds.size && [...currentIds].every((id) => submittedIds.has(id));

      if (!isSameSet) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          status: 'failed',
          message: 'pageIds must list exactly the current pages of the published menu'
        });
      }

      // Same large-offset-then-final-values trick as resequenceMenuPages,
      // just assigning the submitted order instead of the existing one.
      await client.query(
        `UPDATE menu_pages SET sort_order = sort_order + 100000 WHERE menu_version_id = $1`,
        [menuVersionId]
      );

      for (let index = 0; index < pageIds.length; index += 1) {
        await client.query(
          `UPDATE menu_pages SET sort_order = $2, updated_at = NOW() WHERE id = $1`,
          [pageIds[index], index + 1]
        );
      }

      await client.query('COMMIT');

      return res.status(200).json({ status: 'ok', message: 'Menu page order updated' });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Reorder menu pages error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not reorder menu pages'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// Replaces one page's file and/or renames it -- title and pageFile are
// each optional (independently), but at least one must be present. Only
// ever acts on a page belonging to the published version: history is
// read-only.
app.patch(
  '/api/v1/admin/menu/pages/:id',
  requireApprovedAdmin,
  menuUpload.single('pageFile'),
  async (req, res) => {
    const pageId = Number(req.params.id);

    if (!Number.isInteger(pageId) || pageId < 1) {
      return res.status(400).json({ status: 'failed', message: 'Invalid menu page id' });
    }

    const titleProvided = typeof req.body.title === 'string';
    const title = titleProvided && req.body.title.trim() ? req.body.title.trim() : null;

    if (!req.file && !titleProvided) {
      return res.status(400).json({
        status: 'failed',
        message: 'Provide a replacement file, a new title, or both'
      });
    }

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const pageResult = await client.query(
        `
        SELECT mp.id
        FROM menu_pages mp
        JOIN menu_versions mv
          ON mv.id = mp.menu_version_id
        WHERE mp.id = $1 AND mv.status = 'published'
        FOR UPDATE OF mp
        `,
        [pageId]
      );

      if (pageResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Menu page not found'
        });
      }

      let fileFields = '';
      const values = [pageId];

      if (req.file) {
        const { storagePath } = saveMenuFile(req.file.buffer, req.file.mimetype);
        fileFields = `, file_name = $${values.length + 1}, storage_path = $${values.length + 2}, mime_type = $${values.length + 3}, file_size_bytes = $${values.length + 4}`;
        values.push(req.file.originalname, storagePath, req.file.mimetype, req.file.size);
      }

      let titleField = '';
      if (titleProvided) {
        titleField = `, title = $${values.length + 1}`;
        values.push(title);
      }

      const updateResult = await client.query(
        `
        UPDATE menu_pages
        SET updated_at = NOW()${fileFields}${titleField}
        WHERE id = $1
        RETURNING id, sort_order, title, file_name, storage_path, mime_type, file_size_bytes, created_at
        `,
        values
      );

      await client.query('COMMIT');

      return res.status(200).json({
        status: 'ok',
        message: 'Menu page updated',
        page: toMenuPageResponse(updateResult.rows[0])
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Replace menu page error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not update menu page'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// Deletes one page from the published version. Deleting the last
// remaining page is allowed -- the public site already has a graceful
// "menu not published yet" empty state for a published version with zero
// pages, so nothing else needs to change to handle that.
app.delete(
  '/api/v1/admin/menu/pages/:id',
  requireApprovedAdmin,
  async (req, res) => {
    const pageId = Number(req.params.id);

    if (!Number.isInteger(pageId) || pageId < 1) {
      return res.status(400).json({ status: 'failed', message: 'Invalid menu page id' });
    }

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const pageResult = await client.query(
        `
        SELECT mp.id, mp.menu_version_id
        FROM menu_pages mp
        JOIN menu_versions mv
          ON mv.id = mp.menu_version_id
        WHERE mp.id = $1 AND mv.status = 'published'
        FOR UPDATE OF mp
        `,
        [pageId]
      );

      if (pageResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Menu page not found'
        });
      }

      const { menu_version_id: menuVersionId } = pageResult.rows[0];

      // Note: the underlying file in backend/uploads/menu is intentionally
      // left in place, not deleted -- see backend/menu/storage.js. Only the
      // database row goes.
      await client.query(`DELETE FROM menu_pages WHERE id = $1`, [pageId]);

      await resequenceMenuPages(client, menuVersionId);

      await client.query('COMMIT');

      return res.status(200).json({ status: 'ok', message: 'Menu page deleted' });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Delete menu page error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not delete menu page'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// Deletes an entire historical menu version (a past "Previous versions"
// entry), not just one page -- the currently published version can never
// be targeted here, on purpose, so this can't be used as a backdoor way to
// take the live menu down. menu_pages rows for the version are removed by
// the fk_menu_page_version ON DELETE CASCADE the moment the menu_versions
// row goes, so only the version row itself needs deleting here.
//
// A page's underlying file is only unlinked from disk if no OTHER
// menu_pages row (in any version, published or archived) still points at
// the same storage_path -- otherwise deleting this old version would break
// whatever else is still serving that file. File removal happens only
// after the database transaction has committed, and is best-effort: if a
// file somehow can't be removed, the version is still gone from the
// database and from the admin's list, which is what the admin asked for.
app.delete(
  '/api/v1/admin/menu/versions/:versionId',
  requireApprovedAdmin,
  async (req, res) => {
    const versionId = Number(req.params.versionId);

    if (!Number.isInteger(versionId) || versionId < 1) {
      return res.status(400).json({ status: 'failed', message: 'Invalid menu version id' });
    }

    let client;
    let storagePathsToDelete = [];

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const versionResult = await client.query(
        `SELECT id, status FROM menu_versions WHERE id = $1 FOR UPDATE`,
        [versionId]
      );

      if (versionResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Menu version not found'
        });
      }

      if (versionResult.rows[0].status === 'published') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: 'The current published menu cannot be deleted'
        });
      }

      const pagesResult = await client.query(
        `SELECT storage_path FROM menu_pages WHERE menu_version_id = $1`,
        [versionId]
      );

      for (const { storage_path: storagePath } of pagesResult.rows) {
        const referencedElsewhere = await client.query(
          `SELECT 1 FROM menu_pages WHERE storage_path = $1 AND menu_version_id != $2 LIMIT 1`,
          [storagePath, versionId]
        );

        if (referencedElsewhere.rowCount === 0) {
          storagePathsToDelete.push(storagePath);
        }
      }

      await client.query(`DELETE FROM menu_versions WHERE id = $1`, [versionId]);

      await client.query('COMMIT');
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Delete menu version error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not delete menu version'
      });
    } finally {
      if (client) {
        client.release();
      }
    }

    for (const storagePath of storagePathsToDelete) {
      try {
        deleteMenuFile(storagePath);
      } catch (error) {
        console.error(`Could not remove orphaned menu file ${storagePath}:`, error.message);
      }
    }

    return res.status(200).json({ status: 'ok', message: 'Menu version deleted' });
  }
);

// Events Bar 185 publishes publicly (live music nights, tastings, trivia --
// not to be confused with event_enquiries, which are customer private-event
// requests). starts_at/ends_at are TIMESTAMPTZ, so comparing them against
// NOW() below is an absolute-instant comparison and is correct regardless
// of server timezone -- no Sydney-specific conversion is needed to decide
// whether an event has finished, only to display it, which the frontend
// already does in Australia/Sydney time via formatDateTime.
function slugifyEventTitle(title) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);

  return base || 'event';
}

function parseEventTimes(body, res) {
  const { startsAt, endsAt } = body;

  const startsAtDate = new Date(startsAt);

  if (!startsAt || Number.isNaN(startsAtDate.getTime())) {
    res.status(400).json({
      status: 'failed',
      message: 'A valid start date/time is required'
    });
    return null;
  }

  let endsAtDate = null;

  if (endsAt) {
    endsAtDate = new Date(endsAt);

    if (Number.isNaN(endsAtDate.getTime())) {
      res.status(400).json({
        status: 'failed',
        message: 'End date/time is invalid'
      });
      return null;
    }

    if (endsAtDate <= startsAtDate) {
      res.status(400).json({
        status: 'failed',
        message: 'End date/time must be after the start date/time'
      });
      return null;
    }
  }

  return { startsAtDate, endsAtDate };
}

app.get('/api/v1/events', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        event_reference,
        title,
        slug,
        description,
        tag,
        starts_at,
        ends_at
      FROM events
      WHERE status = 'published'
        AND COALESCE(ends_at, starts_at) > NOW()
      ORDER BY starts_at ASC
    `);

    return res.status(200).json({
      status: 'ok',
      events: result.rows.map((row) => ({
        eventReference: row.event_reference,
        title: row.title,
        slug: row.slug,
        description: row.description,
        tag: row.tag,
        startsAt: row.starts_at,
        endsAt: row.ends_at
      }))
    });
  } catch (error) {
    console.error('Get public events error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not load events'
    });
  }
});

app.get(
  '/api/v1/admin/events',
  requireApprovedAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          e.id,
          e.event_reference,
          e.title,
          e.slug,
          e.description,
          e.tag,
          e.starts_at,
          e.ends_at,
          e.status,
          e.created_at,
          e.updated_at,
          u.display_name AS created_by_name
        FROM events e
        LEFT JOIN users u
          ON u.id = e.created_by_user_id
        ORDER BY e.starts_at DESC
      `);

      return res.status(200).json({
        status: 'ok',
        events: result.rows
      });
    } catch (error) {
      console.error('Admin events list error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load events'
      });
    }
  }
);

app.post(
  '/api/v1/admin/events',
  requireApprovedAdmin,
  async (req, res) => {
    const { title, description, tag } = req.body;

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        status: 'failed',
        message: 'A title is required'
      });
    }

    const times = parseEventTimes(req.body, res);
    if (!times) return;

    const { startsAtDate, endsAtDate } = times;

    try {
      const eventReference =
        'B185-EV-' + crypto.randomBytes(5).toString('hex').toUpperCase();
      const slug = `${slugifyEventTitle(title)}-${crypto.randomBytes(3).toString('hex')}`;

      const result = await pool.query(
        `
        INSERT INTO events (
          event_reference, title, slug, description, tag, starts_at, ends_at, status, created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
        RETURNING
          id, event_reference, title, slug, description, tag, starts_at, ends_at, status, created_at, updated_at
        `,
        [
          eventReference,
          title.trim(),
          slug,
          typeof description === 'string' && description.trim() ? description.trim() : null,
          typeof tag === 'string' && tag.trim() ? tag.trim() : null,
          startsAtDate.toISOString(),
          endsAtDate ? endsAtDate.toISOString() : null,
          req.adminUser.id
        ]
      );

      return res.status(201).json({
        status: 'ok',
        message: 'Event created as a draft',
        event: result.rows[0]
      });
    } catch (error) {
      console.error('Create event error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not create event'
      });
    }
  }
);

app.patch(
  '/api/v1/admin/events/:eventReference',
  requireApprovedAdmin,
  async (req, res) => {
    const { eventReference } = req.params;
    const { title, description, tag } = req.body;

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        status: 'failed',
        message: 'A title is required'
      });
    }

    const times = parseEventTimes(req.body, res);
    if (!times) return;

    const { startsAtDate, endsAtDate } = times;

    try {
      const result = await pool.query(
        `
        UPDATE events
        SET
          title = $1,
          description = $2,
          tag = $3,
          starts_at = $4,
          ends_at = $5,
          updated_at = NOW()
        WHERE event_reference = $6
        RETURNING
          id, event_reference, title, slug, description, tag, starts_at, ends_at, status, created_at, updated_at
        `,
        [
          title.trim(),
          typeof description === 'string' && description.trim() ? description.trim() : null,
          typeof tag === 'string' && tag.trim() ? tag.trim() : null,
          startsAtDate.toISOString(),
          endsAtDate ? endsAtDate.toISOString() : null,
          eventReference.trim()
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          status: 'failed',
          message: 'Event not found'
        });
      }

      return res.status(200).json({
        status: 'ok',
        message: 'Event updated',
        event: result.rows[0]
      });
    } catch (error) {
      console.error('Update event error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not update event'
      });
    }
  }
);

// Staff-facing publish/unpublish/cancel/archive actions. 'archived' is a
// deliberate dead end (like bookings' 'cancelled'/'no_show') -- it's the
// non-destructive way to bury an old event from every admin view without
// ever deleting the row, not a state anything comes back from.
const ADMIN_EVENT_TRANSITIONS = {
  draft: ['published', 'cancelled', 'archived'],
  published: ['draft', 'cancelled', 'completed', 'archived'],
  cancelled: ['archived'],
  completed: ['archived'],
  archived: []
};

app.patch(
  '/api/v1/admin/events/:eventReference/status',
  requireApprovedAdmin,
  async (req, res) => {
    const { eventReference } = req.params;
    const { status: nextStatus } = req.body;

    const validTargets = ['draft', 'published', 'cancelled', 'completed', 'archived'];

    if (!validTargets.includes(nextStatus)) {
      return res.status(400).json({
        status: 'failed',
        message: 'Invalid target status'
      });
    }

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const eventResult = await client.query(
        `SELECT id, event_reference, status FROM events WHERE event_reference = $1 FOR UPDATE`,
        [eventReference.trim()]
      );

      if (eventResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Event not found'
        });
      }

      const event = eventResult.rows[0];
      const allowedNext = ADMIN_EVENT_TRANSITIONS[event.status] || [];

      if (!allowedNext.includes(nextStatus)) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Event cannot move from ${event.status} to ${nextStatus}`
        });
      }

      const result = await client.query(
        `
        UPDATE events
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING
          id, event_reference, title, slug, description, tag, starts_at, ends_at, status, created_at, updated_at
        `,
        [nextStatus, event.id]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        status: 'ok',
        message: `Event updated to ${nextStatus}`,
        event: result.rows[0]
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Update event status error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not update event status'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// Lets staff retry a notification (booking confirmation, OTP-adjacent
// delivery, etc.) that failed -- e.g. because a provider was briefly down
// or, in this environment, not configured. Booking success was never
// coupled to delivery succeeding, so this is purely "try sending again,"
// not anything that touches the booking/request that triggered it.
app.post(
  '/api/v1/admin/notifications/:notificationReference/retry',
  requireApprovedAdmin,
  async (req, res) => {
    const { notificationReference } = req.params;

    try {
      const result = await notifications.retryNotificationJob(notificationReference.trim());

      if (result.error === 'Notification job not found') {
        return res.status(404).json({
          status: 'failed',
          message: 'Notification job not found'
        });
      }

      return res.status(200).json({
        status: result.ok ? 'sent' : 'failed',
        message: result.ok ? 'Notification re-sent' : (result.error || 'Retry failed'),
        reference: result.reference
      });
    } catch (error) {
      console.error('Retry notification error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not retry notification'
      });
    }
  }
);

// Multer's fileFilter/size-limit errors reach us via Express's error-handling
// middleware (four-argument signature), not the normal request pipeline --
// without this, they'd fall through to Express's default HTML error page
// instead of the JSON responses the rest of this API returns.
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || /file/i.test(error.message || '')) {
    return res.status(400).json({
      status: 'failed',
      message: error.message
    });
  }

  console.error('Unhandled error:', error.message);

  return res.status(500).json({
    status: 'failed',
    message: 'Unexpected server error'
  });
});

app.listen(PORT, () => {
  console.log(`Bar 185 API running on http://localhost:${PORT}`);
});
