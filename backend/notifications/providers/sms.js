// SMS provider: Twilio (https://twilio.com). See backend/notifications/README.md
// for why this provider was chosen and which environment variables it needs.
//
// Returns { ok: true, providerId } on success, or { ok: false, error } on
// failure -- never throws, so a provider outage can never surface as an
// unhandled exception in a booking request.
async function sendSms({ to, body }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    return {
      ok: false,
      error: 'SMS provider is not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN or TWILIO_FROM_NUMBER)',
    };
  }

  try {
    const params = new URLSearchParams({ To: to, From: from, Body: body });
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: data.message || `Twilio responded with ${response.status}` };
    }

    return { ok: true, providerId: data.sid };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { sendSms };
