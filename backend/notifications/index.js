const crypto = require('crypto');
const pool = require('../db');
const { normalizeAuMobile } = require('./phone');
const { sendEmail } = require('./providers/email');
const { sendSms } = require('./providers/sms');
const templates = require('./templates');

function newReference() {
  return 'B185-NTF-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

// Attempts delivery for one existing notification_jobs row and records the
// outcome back onto it. Shared by queueAndSend (first attempt, right after
// insert) and retryNotificationJob (a later attempt on an already-failed
// row) so both go through the exact same provider-call-then-record path.
// Never throws: a provider failure is recorded as a failed job, not an
// exception, so it can never undo or corrupt the booking that triggered it.
async function attemptDelivery(jobId, { channel, recipientEmail, recipientPhone, subject, messageBody }) {
  let result;

  try {
    if (channel === 'email') {
      result = await sendEmail({ to: recipientEmail, subject, html: messageBody, text: messageBody });
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

  const result = await attemptDelivery(jobId, { channel, recipientEmail, recipientPhone, subject, messageBody });

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

function notifyBookingConfirmed(booking, slot) {
  return safely('booking confirmed', async () => {
    const followedReview = booking.booking_type === 'large_group';

    const content = templates.bookingConfirmed({
      customerName: booking.customer_name,
      bookingReference: booking.booking_reference,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      partySize: booking.party_size,
      followedReview,
      specialRequests: booking.special_requests || null,
    });

    await sendPair({
      // A large-group approval produces a real confirmed booking, but it's
      // worth being able to tell it apart from an instant standard booking
      // when looking at notification_jobs later.
      type: followedReview ? 'large_group_confirmation' : 'booking_confirmation',
      recipientName: booking.customer_name,
      recipientEmail: booking.customer_email,
      recipientPhone: booking.customer_phone,
      content,
      bookingId: booking.id,
    });
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

    await sendPair({
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

    await sendPair({
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

    await sendPair({
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
