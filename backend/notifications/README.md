# Bar 185 notifications

## Providers

**Email: [Resend](https://resend.com)**
Chosen because it has the least setup friction for a university/demo
project: a free tier with no credit card, a single REST endpoint (no SDK
needed — `providers/email.js` just uses `fetch`), and a built-in
`onboarding@resend.dev` sender that works immediately without verifying a
domain, so a real confirmation email can be sent today.

**SMS: [Twilio](https://twilio.com)**
The standard choice for a demo like this: free trial credit, a simple REST
API (again just `fetch`, no SDK), and Bar 185's SMS wording (concise,
reference-first) maps directly onto a single `Messages` API call.

Both are wrapped behind a small provider interface
(`sendEmail({...})` / `sendSms({...})`) so either could be swapped for
another provider later without touching `notifications/index.js` or
`server.js`.

## Booking confirmations: one channel, chosen by the customer

The booking form asks "How would you like to receive your confirmation?"
(Email or SMS). The choice is stored as `confirmation_method` on the
booking (and on a large-group request, then copied onto the booking when
staff approve it). `notifyBookingConfirmed` then:

1. **Claims** the booking with one conditional `UPDATE` (only a booking
   whose `status = 'confirmed'` and whose `confirmation_delivery_status`
   is still `NULL`). A retried Stripe webhook or any repeat call finds
   nothing to claim, so the same confirmation is never sent twice.
2. **Sends through the chosen channel only.** Older rows with no method
   fall back to email. SMS with no valid Australian mobile is recorded as
   a failure rather than silently switching to email.
3. **Records the outcome** on the booking (`confirmation_delivery_status`
   `sent`/`failed`, `confirmation_sent_at`, `confirmation_delivery_error`)
   and in `notification_jobs`. A failure also creates a
   "Confirmation not delivered" admin notification.

It never changes `bookings.status`: a failed email/SMS leaves a valid
confirmed booking confirmed. Deposit bookings are only confirmed (and so
only sent a confirmation) by the Stripe `checkout.session.completed`
webhook, after payment succeeds.

Large-group acknowledgement/decline messages and cancellation messages
also follow the customer's chosen channel when one is recorded.

## Environment variables needed

Add these to `backend/.env` (never commit real values):

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender address, e.g. `Bar 185 <onboarding@resend.dev>` for a demo, or a verified domain address later |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | A Twilio phone number capable of sending SMS, in E.164 (e.g. `+61...` or a Twilio US number) |

If any of these are missing, the corresponding provider call fails
gracefully (`{ ok: false, error }`) and that attempt is recorded as a
`failed` row in `notification_jobs` with a clear `last_error` — it does
**not** throw, and it never affects the booking/cancellation/review request
that triggered it.

## Contact verification (OTP) uses these providers too, but bypasses notification_jobs

`backend/verification/` (see its own comments) sends one-time codes through
the same `sendEmail`/`sendSms` functions above, but calls them directly
instead of going through `queueAndSend` — `notification_jobs` is a
permanent, never-deleted log, and a one-time code must never be written to
any durable row in plaintext, so it can't go through that pipeline. It has
its own table, `verification_requests`, storing only a salted hash of the
code.

One additional variable, also in `backend/.env`:

| Variable | Purpose |
|---|---|
| `OTP_HASH_SECRET` | HMAC pepper for hashing verification codes before they're stored. Optional — falls back to an insecure dev default if unset, so it works out of the box locally, but **must** be set to a long random value in any real deployment. |

## Known trial-account restriction

A Twilio **trial** account can only send SMS to phone numbers you've
manually verified in the Twilio console. Until the account is upgraded,
SMS to any other number will fail with a Twilio error captured in
`notification_jobs.last_error` — this is expected, not a bug in this
integration.
