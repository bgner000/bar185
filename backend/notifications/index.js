const crypto = require('crypto');
const pool = require('../db');
const { normalizeAuMobile } = require('./phone');
const { sendEmail } = require('./providers/email');
const { sendSms } = require('./providers/sms');
const templates = require('./templates');
const adminNotifications = require('../adminNotifications');

const CONFIRMATION_METHODS = ['email', 'sms'];

// Crude but safe HTML -> plain text for the email's text/plain part (the
// stored message body is the HTML version). Only used when a dedicated
// plain-text body isn't supplied.
function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function newReference() {
  return 'B185-NTF-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

// Attempts delivery for one existing notification_jobs row and records the
// outcome back onto it. Shared by queueAndSend (first attempt, right after
// insert) and retryNotificationJob (a later attempt on an already-failed
// row) so both go through the exact same provider-call-then-record path.
// Never throws: a provider failure is recorded as a failed job, not an
// exception, so it can never undo or corrupt the booking that triggered it.
async function attemptDelivery(jobId, { channel, recipientEmail, recipientPhone, subject, messageBody, textBody, precheckError }) {
  let result;

  try {
    if (precheckError) {
      // A problem known before any provider call (e.g. SMS chosen but no
      // valid mobile on file) -- recorded as a normal failed job so it's
      // visible in the same place as a provider failure.
      result = { ok: false, error: precheckError };
    } else if (channel === 'email') {
      result = await sendEmail({
        to: recipientEmail,
        subject,
        html: messageBody,
        text: textBody || htmlToText(messageBody),
      });
    } else {
      result = await sendSms({ to: recipientPhone, body: messageBody });
    }
  } catch (error) {
    result = { ok: false, error: error.message };
  }

  await pool.query(
    `
    UPDATE notification_jobs
    SET
      status = $2::notification_status,
      attempt_count = attempt_count + 1,
      last_error = $3,
      sent_at = COALESCE($4::timestamptz, sent_at),
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      jobId,
      result.ok ? 'sent' : 'failed',
      result.ok ? null : result.error,
      result.ok ? new Date().toISOString() : null,
    ]
  );

  return result;
}

// Creates one notification_jobs row and immediately attempts delivery
// through the matching provider, recording the outcome back onto that row.
async function queueAndSend({
  type,
  channel,
  recipientName,
  recipientEmail,
  recipientPhone,
  subject,
  messageBody,
  bookingId = null,
  eventEnquiryId = null,
  textBody = null,
  precheckError = null,
}) {
  const reference = newReference();

  const insertResult = await pool.query(
    `
    INSERT INTO notification_jobs (
      notification_reference, notification_type, channel, status,
      recipient_name, recipient_email, recipient_phone,
      subject, message_body, booking_id, event_enquiry_id, attempt_count
    )
    VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, 0)
    RETURNING id
    `,
    [
      reference,
      type,
      channel,
      recipientName,
      recipientEmail,
      recipientPhone,
      subject,
      messageBody,
      bookingId,
      eventEnquiryId,
    ]
  );

  const jobId = insertResult.rows[0].id;

  const result = await attemptDelivery(jobId, {
    channel,
    recipientEmail,
    recipientPhone,
    subject,
    messageBody,
    textBody,
    precheckError,
  });

  return { reference, ...result };
}

// Re-attempts delivery for a job that previously failed (or any job, in
// principle), reusing the same recipient/content already stored on the row
// rather than needing the original booking/enquiry again. This is what
// "notification failure does not delete successful booking" resolves to in
// practice -- the booking already exists; this just gives failed delivery
// a way forward without ever touching it.
async function retryNotificationJob(notificationReference) {
  const jobResult = await pool.query(
    `
    SELECT id, channel, recipient_email, recipient_phone, subject, message_body, status
    FROM notification_jobs
    WHERE notification_reference = $1
    `,
    [notificationReference]
  );

  if (jobResult.rowCount === 0) {
    return { ok: false, error: 'Notification job not found' };
  }

  const job = jobResult.rows[0];

  const result = await attemptDelivery(job.id, {
    channel: job.channel,
    recipientEmail: job.recipient_email,
    recipientPhone: job.recipient_phone,
    subject: job.subject,
    messageBody: job.message_body,
  });

  return { reference: notificationReference, ...result };
}

async function sendPair({ type, recipientName, recipientEmail, recipientPhone, content, bookingId, eventEnquiryId }) {
  const jobs = [];

  jobs.push(
    queueAndSend({
      type,
      channel: 'email',
      recipientName,
      recipientEmail,
      recipientPhone: null,
      subject: content.subject,
      messageBody: content.html,
      bookingId,
      eventEnquiryId,
    })
  );

  const normalizedPhone = normalizeAuMobile(recipientPhone);

  if (normalizedPhone) {
    jobs.push(
      queueAndSend({
        type,
        channel: 'sms',
        recipientName,
        recipientEmail: null,
        recipientPhone: normalizedPhone,
        subject: null,
        messageBody: content.sms,
        bookingId,
        eventEnquiryId,
      })
    );
  }

  const settled = await Promise.allSettled(jobs);

  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      console.error('Notification job failed unexpectedly:', outcome.reason?.message || outcome.reason);
    }
  }

  return settled;
}

// Sends through ONE channel -- the one the customer chose. Returns the
// single delivery result ({ ok, error, reference }). An SMS choice without
// a valid Australian mobile is recorded as a failed job rather than
// silently falling back to email.
async function sendSelected({ method, type, recipientName, recipientEmail, recipientPhone, content, bookingId, eventEnquiryId }) {
  if (method === 'sms') {
    const normalizedPhone = normalizeAuMobile(recipientPhone);

    return queueAndSend({
      type,
      channel: 'sms',
      recipientName,
      recipientEmail: null,
      recipientPhone: normalizedPhone || (recipientPhone ? String(recipientPhone) : null),
      subject: null,
      messageBody: content.sms,
      bookingId,
      eventEnquiryId,
      precheckError: normalizedPhone ? null : 'No valid Australian mobile number on file for SMS confirmation',
    });
  }

  return queueAndSend({
    type,
    channel: 'email',
    recipientName,
    recipientEmail,
    recipientPhone: null,
    subject: content.subject,
    messageBody: content.html,
    textBody: content.text,
    bookingId,
    eventEnquiryId,
  });
}

// Customer notifications other than the booking confirmation: when the
// customer has chosen a channel, use only that one. Rows created before
// the channel choice existed (method NULL) keep the original behaviour.
function sendForRecord({ method, ...rest }) {
  if (CONFIRMATION_METHODS.includes(method)) {
    return sendSelected({ method, ...rest });
  }

  return sendPair(rest);
}

// Every notify* function below is safe to `await` unconditionally: internal
// errors are caught and logged rather than rejecting, so a notification
// problem can never fail the booking/cancellation/review request that
// triggered it.
async function safely(label, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(`Notification error (${label}):`, error.message);
  }
}

// Sends the customer's booking confirmation exactly once, through the
// single channel they chose, and records the outcome on the booking.
//
// Order of operations matters:
//   1. Claim: one conditional UPDATE moves confirmation_delivery_status
//      from NULL to 'pending' -- only for a booking that is genuinely
//      'confirmed'. A second call for the same booking (a retried Stripe
//      webhook, a double click, anything) finds nothing to claim and
//      sends nothing.
//   2. Send via the chosen channel (NULL method on an older row -> email).
//   3. Record 'sent' / 'failed' (+ error) on the booking, and raise an
//      admin notification on failure.
// Nothing here ever changes bookings.status: a failed email/SMS leaves a
// valid confirmed booking exactly as it was.
function notifyBookingConfirmed(booking, slot) {
  return safely('booking confirmed', async () => {
    const claim = await pool.query(
      `
      UPDATE bookings
      SET confirmation_delivery_status = 'pending', updated_at = NOW()
      WHERE id = $1
        AND status = 'confirmed'
        AND confirmation_delivery_status IS NULL
        AND confirmation_sent_at IS NULL
      RETURNING
        id, booking_reference, booking_type, party_size,
        customer_name, customer_email, customer_phone, special_requests,
        deposit_status, deposit_amount_cents, confirmation_method
      `,
      [booking.id]
    );

    if (claim.rowCount === 0) {
      // Already sent / being sent / not actually confirmed -- never send twice.
      return;
    }

    const row = claim.rows[0];
    const method = CONFIRMATION_METHODS.includes(row.confirmation_method) ? row.confirmation_method : 'email';
    const followedReview = row.booking_type === 'large_group';

    const content = templates.bookingConfirmed({
      customerName: row.customer_name,
      bookingReference: row.booking_reference,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      partySize: row.party_size,
      followedReview,
      specialRequests: row.special_requests || null,
      depositStatus: row.deposit_status,
      depositAmountCents: row.deposit_amount_cents,
    });

    let result;

    try {
      result = await sendSelected({
        method,
        // A large-group approval produces a real confirmed booking, but it's
        // worth being able to tell it apart from an instant standard booking
        // when looking at notification_jobs later.
        type: followedReview ? 'large_group_confirmation' : 'booking_confirmation',
        recipientName: row.customer_name,
        recipientEmail: row.customer_email,
        recipientPhone: row.customer_phone,
        content,
        bookingId: row.id,
      });
    } catch (error) {
      result = { ok: false, error: error.message };
    }

    await pool.query(
      `
      UPDATE bookings
      SET
        confirmation_delivery_status = $2::confirmation_delivery_status,
        confirmation_sent_at = CASE WHEN $4 THEN NOW() ELSE confirmation_sent_at END,
        confirmation_delivery_error = $3,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        row.id,
        result.ok ? 'sent' : 'failed',
        result.ok ? null : String(result.error || 'Unknown delivery error').slice(0, 500),
        Boolean(result.ok),
      ]
    );

    if (!result.ok) {
      console.error(`Booking confirmation (${method}) failed for ${row.booking_reference}:`, result.error);
      await adminNotifications.notifyConfirmationDeliveryFailed(row, method, result.error);
    }
  });
}

function notifyLargeGroupPending(request) {
  return safely('large-group pending', async () => {
    const content = templates.largeGroupPending({
      customerName: request.customer_name,
      requestReference: request.request_reference,
      startsAt: request.slot_start_at,
      partySize: request.party_size,
    });

    await sendForRecord({
      method: request.confirmation_method,
      type: 'large_group_acknowledgement',
      recipientName: request.customer_name,
      recipientEmail: request.customer_email,
      recipientPhone: request.customer_phone,
      content,
    });
  });
}

function notifyLargeGroupDeclined(request) {
  return safely('large-group declined', async () => {
    const content = templates.largeGroupDeclined({
      customerName: request.customer_name,
      requestReference: request.request_reference,
      declineReason: request.decline_reason || null,
    });

    await sendForRecord({
      method: request.confirmation_method,
      type: 'large_group_declined',
      recipientName: request.customer_name,
      recipientEmail: request.customer_email,
      recipientPhone: request.customer_phone,
      content,
    });
  });
}

function notifyBookingCancelled(booking) {
  return safely('booking cancelled', async () => {
    const content = templates.bookingCancelled({
      customerName: booking.customer_name,
      bookingReference: booking.booking_reference,
    });

    await sendForRecord({
      method: booking.confirmation_method,
      type: 'booking_cancellation',
      recipientName: booking.customer_name,
      recipientEmail: booking.customer_email,
      recipientPhone: booking.customer_phone,
      content,
      bookingId: booking.id,
    });
  });
}

module.exports = {
  notifyBookingConfirmed,
  notifyLargeGroupPending,
  notifyLargeGroupDeclined,
  notifyBookingCancelled,
  retryNotificationJob,
};
