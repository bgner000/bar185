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

## Known trial-account restriction

A Twilio **trial** account can only send SMS to phone numbers you've
manually verified in the Twilio console. Until the account is upgraded,
SMS to any other number will fail with a Twilio error captured in
`notification_jobs.last_error` — this is expected, not a bug in this
integration.
