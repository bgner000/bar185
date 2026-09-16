// Email provider: Resend (https://resend.com). See backend/notifications/README.md
// for why this provider was chosen and which environment variables it needs.
//
// Returns { ok: true, providerId } on success, or { ok: false, error } on
// failure -- never throws, so a provider outage can never surface as an
// unhandled exception in a booking request.
async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { ok: false, error: 'Email provider is not configured (missing RESEND_API_KEY or EMAIL_FROM)' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: data.message || `Resend responded with ${response.status}` };
    }

    return { ok: true, providerId: data.id };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { sendEmail };
