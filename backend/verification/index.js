const crypto = require('crypto');
const pool = require('../db');
const { normalizeAuMobile } = require('../notifications/phone');
const { sendEmail } = require('../notifications/providers/email');
const { sendSms } = require('../notifications/providers/sms');
const templates = require('../notifications/templates');

// Tunable OTP policy. Kept in one place so the completion report and any
// future adjustment only need to touch this block.
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const RATE_LIMIT_WINDOW_MINUTES = 30;
const MAX_SENDS_PER_DESTINATION = 5;
const MAX_SENDS_PER_IP = 10;

const GENERIC_SEND_FAILURE = "We couldn't send the code right now. Please try again.";
const GENERIC_VERIFY_FAILURE = 'Please verify your phone number or email before booking.';

// Thrown when a booking/large-group request has no valid, current
// verification proof. Caught specifically in server.js so callers get a
// clear 403 instead of falling into the generic 500 handler.
class VerificationError extends Error {
  constructor(message = GENERIC_VERIFY_FAILURE) {
    super(message);
    this.name = 'VerificationError';
  }
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

// HMAC rather than a bare hash: a leaked verification_requests row alone
// still isn't enough to test guesses against without this server-side
// secret too. Including the destination stops the same 6-digit code
// hashing identically across two different recipients.
function hashCode(code, destination) {
  const secret = process.env.OTP_HASH_SECRET || 'dev-only-otp-secret-change-me';
  return crypto.createHmac('sha256', secret).update(`${destination}:${code}`).digest('hex');
}

function generateOtp() {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

function newVerificationReference() {
  return 'B185-VF-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

// Sends a fresh OTP to the given channel/destination. Returns a plain
// { ok, ... } result rather than throwing, so server.js can translate it
// straight into the right HTTP response without a try/catch per caller.
async function sendCode({ channel, email, phone, ipAddress }) {
  if (channel !== 'email' && channel !== 'sms') {
    return { ok: false, status: 400, message: 'Invalid verification channel' };
  }

  let destination;

  if (channel === 'email') {
    destination = normalizeEmail(email);
    if (!destination) {
      return { ok: false, status: 400, message: 'Please enter a valid email address.' };
    }
  } else {
    destination = normalizeAuMobile(phone);
    if (!destination) {
      return { ok: false, status: 400, message: 'Please enter a valid Australian mobile number.' };
    }
  }

  try {
    const lastSend = await pool.query(
      `
      SELECT created_at FROM verification_requests
      WHERE channel = $1 AND destination = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [channel, destination]
    );

    if (lastSend.rowCount > 0) {
      const elapsedSeconds = (Date.now() - new Date(lastSend.rows[0].created_at).getTime()) / 1000;

      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        return {
          ok: false,
          status: 429,
          message: 'Please wait before requesting another code.',
          retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds),
        };
      }
    }

    const [destinationCount, ipCount] = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*)::int AS count FROM verification_requests
        WHERE channel = $1 AND destination = $2
          AND created_at > NOW() - ($3 || ' minutes')::interval
        `,
        [channel, destination, RATE_LIMIT_WINDOW_MINUTES]
      ),
      ipAddress
        ? pool.query(
            `
            SELECT COUNT(*)::int AS count FROM verification_requests
            WHERE ip_address = $1
              AND created_at > NOW() - ($2 || ' minutes')::interval
            `,
            [ipAddress, RATE_LIMIT_WINDOW_MINUTES]
          )
        : Promise.resolve({ rows: [{ count: 0 }] }),
    ]);

    if (
      destinationCount.rows[0].count >= MAX_SENDS_PER_DESTINATION ||
      ipCount.rows[0].count >= MAX_SENDS_PER_IP
    ) {
      return { ok: false, status: 429, message: 'Too many attempts. Please try again later.' };
    }

    const code = generateOtp();
    const codeHash = hashCode(code, destination);
    const verificationReference = newVerificationReference();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const content = templates.verificationCode({ code, expiresInMinutes: OTP_EXPIRY_MINUTES });

    // Sent directly through the provider, never through notification_jobs --
    // that table is a permanent log, and the message body here is the one
    // place the plaintext code briefly exists in transit. It must not be
    // written to any durable row.
    //
    // Delivery is attempted BEFORE anything is written to the database.
    // verification_requests exists to record codes a customer can actually
    // receive and act on -- a row for a code that was never delivered would
    // still count toward the resend cooldown and rate limit on the very
    // next attempt, turning a provider outage into "please wait" instead of
    // a clear failure. Dev-only: logs that a request was made, never the
    // code itself (see the OTP_DEV_LOG_CODE block below, gated separately).
    console.log(`[DEV OTP] verification send requested (channel=${channel})`);

    const sendResult =
      channel === 'email'
        ? await sendEmail({ to: destination, subject: content.subject, html: content.html, text: content.text })
        : await sendSms({ to: destination, body: content.sms });

    if (!sendResult.ok) {
      console.error('Verification send failed:', sendResult.error);
      return { ok: false, status: 502, message: GENERIC_SEND_FAILURE };
    }

    // Development-only: makes local testing possible without a configured
    // provider or reading raw table rows. Never runs when NODE_ENV is
    // 'production', and never reaches any HTTP response -- console only.
    if (process.env.NODE_ENV !== 'production' && process.env.OTP_DEV_LOG_CODE === 'true') {
      console.log(`[DEV OTP] code for ${destination}: ${code}`);
    }

    await pool.query(
      `
      INSERT INTO verification_requests (
        verification_reference, channel, destination, code_hash, max_attempts, expires_at, ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [verificationReference, channel, destination, codeHash, MAX_VERIFY_ATTEMPTS, expiresAt.toISOString(), ipAddress || null]
    );

    return {
      ok: true,
      verificationId: verificationReference,
      channel,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    };
  } catch (error) {
    console.error('Verification send error:', error.message);
    return { ok: false, status: 500, message: GENERIC_SEND_FAILURE };
  }
}

// Checks a submitted code against the stored hash. Locks the row for the
// duration of the check so a double-click / concurrent retry can't both
// pass, and so the attempts counter can't be undercounted by a race.
async function verifyCode({ verificationId, code }) {
  if (typeof verificationId !== 'string' || !verificationId.trim() || typeof code !== 'string' || !code.trim()) {
    return { ok: false, status: 400, message: 'That verification code is incorrect.' };
  }

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const result = await client.query(
      `
      SELECT id, destination, code_hash, attempts, max_attempts, expires_at, verified_at, consumed_at
      FROM verification_requests
      WHERE verification_reference = $1
      FOR UPDATE
      `,
      [verificationId.trim()]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 400, message: 'That verification code is incorrect.' };
    }

    const record = result.rows[0];

    if (record.verified_at && !record.consumed_at) {
      await client.query('COMMIT');
      return { ok: true };
    }

    if (record.consumed_at || new Date(record.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return { ok: false, status: 400, message: 'That code has expired. Request a new code.' };
    }

    if (record.attempts >= record.max_attempts) {
      await client.query('ROLLBACK');
      return { ok: false, status: 429, message: 'Too many attempts. Request a new code.' };
    }

    const submittedHash = hashCode(code.trim(), record.destination);

    if (submittedHash !== record.code_hash) {
      const nextAttempts = record.attempts + 1;

      await client.query(
        `UPDATE verification_requests SET attempts = $2, updated_at = NOW() WHERE id = $1`,
        [record.id, nextAttempts]
      );

      await client.query('COMMIT');

      if (nextAttempts >= record.max_attempts) {
        return { ok: false, status: 429, message: 'Too many attempts. Request a new code.' };
      }

      return { ok: false, status: 400, message: 'That verification code is incorrect.' };
    }

    await client.query(
      `UPDATE verification_requests SET verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [record.id]
    );

    await client.query('COMMIT');

    return { ok: true };
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    console.error('Verification verify error:', error.message);
    return { ok: false, status: 500, message: 'That verification code is incorrect.' };
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Called from inside the booking / large-group-request transaction, right
// before the row that actually needs the proof is inserted -- never
// earlier, so a request that gets redirected (e.g. large-group required)
// or rejected (e.g. capacity) never wastes the customer's verification.
// Throws VerificationError on any failure; never reveals which specific
// check failed to the caller, since none of that is useful to a genuine
// customer and all of it is useful to someone probing the endpoint.
//
// requiredChannel is optional: standard bookings secured by
// booking_security_method = 'email_verification' pass 'email' so a phone
// (SMS) proof can't be substituted for it, even though the underlying OTP
// endpoints still support both channels generically. Large-group requests
// don't pass it, since either channel has always been accepted there.
async function consumeVerification(client, { verificationId, customerEmail, customerPhone, requiredChannel }) {
  if (typeof verificationId !== 'string' || !verificationId.trim()) {
    throw new VerificationError();
  }

  const result = await client.query(
    `
    SELECT id, channel, destination, verified_at, consumed_at, expires_at
    FROM verification_requests
    WHERE verification_reference = $1
    FOR UPDATE
    `,
    [verificationId.trim()]
  );

  if (result.rowCount === 0) {
    throw new VerificationError();
  }

  const record = result.rows[0];

  if (!record.verified_at || record.consumed_at || new Date(record.expires_at) < new Date()) {
    throw new VerificationError();
  }

  if (requiredChannel && record.channel !== requiredChannel) {
    throw new VerificationError();
  }

  const expectedDestination =
    record.channel === 'email' ? normalizeEmail(customerEmail) : normalizeAuMobile(customerPhone);

  if (!expectedDestination || expectedDestination !== record.destination) {
    throw new VerificationError();
  }

  await client.query(
    `UPDATE verification_requests SET consumed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [record.id]
  );
}

module.exports = {
  sendCode,
  verifyCode,
  consumeVerification,
  VerificationError,
};
