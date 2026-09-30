const SYDNEY_TZ = 'Australia/Sydney';

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-AU', {
    timeZone: SYDNEY_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(value) {
  const formatted = new Date(value).toLocaleTimeString('en-AU', {
    timeZone: SYDNEY_TZ,
    hour: 'numeric',
    minute: '2-digit',
  });

  return formatted.replace(/am|pm/i, (match) => match.toUpperCase());
}

// Customer-entered text (names, special requests, decline reasons) is
// escaped before it goes into any HTML email body, so a value like
// "<b>Sam</b>" is shown literally instead of being rendered as markup.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "  Suprin   Gurung " -> "Suprin". Falls back to a neutral greeting if
// the stored name is somehow blank.
function firstName(fullName) {
  const first = String(fullName ?? '').trim().split(/\s+/)[0];
  return first || 'there';
}

// "Thursday, 1 October 2026" -- the long form used in the confirmation
// email's summary (SMS keeps the short formatDate form above).
function formatLongDate(value) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value || '';

  return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}`;
}

// Only a deposit that has actually been paid is shown ("A$10 paid").
// Bookings without a deposit get no deposit row at all.
function formatDepositPaid(depositStatus, depositAmountCents) {
  if (depositStatus !== 'paid') return null;

  const dollars = (Number(depositAmountCents) || 1000) / 100;
  const amount = Number.isInteger(dollars) ? `A$${dollars}` : `A$${dollars.toFixed(2)}`;

  return `${amount} paid`;
}

// Special requests are shown only when the customer wrote something real --
// blanks and placeholder answers like "N/A" or "none" are left out.
const EMPTY_REQUEST_VALUES = new Set(['n/a', 'na', 'none', 'nil', 'no', '-', '--', '.', 'nothing']);

function meaningfulText(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || EMPTY_REQUEST_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

const VENUE_ADDRESS_LINES = ['185 Marrickville Road', 'Marrickville NSW 2204'];
const VENUE_ADDRESS_SMS = '185 Marrickville Rd, Marrickville';

// The public site's Book page, for the "Need to change your booking?" line.
// Uses the same FRONTEND_ORIGIN the backend already uses for Stripe return
// URLs; if it isn't set, the line is shown without a link.
function bookPageUrl() {
  const origin = (process.env.FRONTEND_ORIGIN || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(origin) ? `${origin}/book` : null;
}

// Bar 185 palette, matching the public site (index.css tokens), expressed
// as literal hex values because email clients don't support CSS variables.
const EMAIL_COLORS = {
  page: '#f1ebe0', // --stone
  surface: '#ffffff',
  paper: '#faf7f1', // --paper
  text: '#262019', // --text (15:1 on white)
  muted: '#5c5245', // --text-muted (7.7:1 on white)
  wine: '#6d2531', // --wine (10.7:1 on white)
  rule: '#e3dccf', // decorative divider
};

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "Arial, Helvetica, sans-serif";

function bookingConfirmed({
  customerName,
  bookingReference,
  startsAt,
  endsAt,
  partySize,
  followedReview,
  specialRequests,
  depositStatus,
  depositAmountCents,
}) {
  const name = firstName(customerName);
  const shortDate = formatDate(startsAt);
  const longDate = formatLongDate(startsAt);
  const start = formatTime(startsAt);
  const time = endsAt ? `${start} – ${formatTime(endsAt)}` : start;
  const deposit = formatDepositPaid(depositStatus, depositAmountCents);
  const requests = meaningfulText(specialRequests);
  const guests = String(partySize);
  const bookUrl = bookPageUrl();

  const introLine = followedReview
    ? 'Following staff review, your table at Bar 185 is confirmed.'
    : 'Your table at Bar 185 is confirmed.';
  const changeLine =
    'Visit the Book page and use your booking reference together with the email address used for the booking.';

  const detailRows = [
    ['Booking reference', bookingReference],
    ['Date', longDate],
    ['Time', time],
    ['Guests', guests],
    ...(deposit ? [['Deposit', deposit]] : []),
    ...(requests ? [['Special requests', requests]] : []),
  ];

  const c = EMAIL_COLORS;

  const rowHtml = ([label, value], index) => `
                <tr>
                  <td class="summary-label" width="38%" valign="top" style="padding:14px 16px 14px 0;${index ? `border-top:1px solid ${c.rule};` : ''}font-family:${SANS};font-size:14px;line-height:20px;color:${c.muted};">${escapeHtml(label)}</td>
                  <td class="summary-value" valign="top" style="padding:14px 0;${index ? `border-top:1px solid ${c.rule};` : ''}font-family:${SANS};font-size:16px;line-height:22px;font-weight:bold;color:${c.text};word-break:break-word;">${escapeHtml(value)}</td>
                </tr>`;

  const changeHtml = bookUrl
    ? escapeHtml(changeLine).replace(
        'Book page',
        `<a href="${escapeHtml(bookUrl)}" style="color:${c.wine};text-decoration:underline;">Book page</a>`
      )
    : escapeHtml(changeLine);

  const preheader = `Booking ${bookingReference} confirmed: ${shortDate}, ${start}, ${guests} guests.`;

  // Email-client-safe HTML: table layout, inline styles, 600px max width,
  // system fonts (Georgia for the serif wordmark/heading, Arial for body),
  // no background images, gradients or web fonts. One small <style> block
  // only adds mobile padding/stacking for clients that support it; the
  // email reads correctly where it's stripped.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Your Bar 185 booking is confirmed</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .summary-label, .summary-value { display: block !important; width: 100% !important; }
    .summary-label { padding: 12px 0 2px 0 !important; }
    .summary-value { padding: 0 0 12px 0 !important; border-top: 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${c.page};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.page};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${c.surface};border:1px solid ${c.rule};">
          <tr>
            <td class="pad" style="padding:36px 48px 28px 48px;border-bottom:1px solid ${c.rule};background-color:${c.paper};">
              <p style="margin:0;font-family:${SERIF};font-size:30px;line-height:34px;color:${c.text};">Bar <span style="color:${c.wine};">185</span></p>
              <p style="margin:6px 0 0 0;font-family:${SANS};font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${c.muted};">Marrickville</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:36px 48px 8px 48px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="2" style="width:32px;height:2px;line-height:2px;font-size:2px;background-color:${c.wine};">&nbsp;</td></tr></table>
              <h1 style="margin:14px 0 20px 0;font-family:${SERIF};font-size:28px;line-height:34px;font-weight:normal;color:${c.text};">Booking confirmed</h1>
              <p style="margin:0 0 8px 0;font-family:${SANS};font-size:16px;line-height:24px;color:${c.text};">Hi ${escapeHtml(name)},</p>
              <p style="margin:0 0 24px 0;font-family:${SANS};font-size:16px;line-height:24px;color:${c.text};">${escapeHtml(introLine)}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:0 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${c.text};border-bottom:1px solid ${c.rule};">${detailRows.map(rowHtml).join('')}
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:28px 48px 0 48px;">
              <h2 style="margin:0 0 6px 0;font-family:${SERIF};font-size:18px;line-height:24px;font-weight:normal;color:${c.text};">Venue</h2>
              <p style="margin:0;font-family:${SANS};font-size:16px;line-height:24px;color:${c.text};">${VENUE_ADDRESS_LINES.map(escapeHtml).join('<br>')}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:24px 48px 0 48px;">
              <h2 style="margin:0 0 6px 0;font-family:${SERIF};font-size:18px;line-height:24px;font-weight:normal;color:${c.text};">Need to change your booking?</h2>
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:23px;color:${c.muted};">${changeHtml}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:32px 48px 40px 48px;">
              <p style="margin:0 0 6px 0;font-family:${SANS};font-size:16px;line-height:24px;color:${c.text};">We look forward to seeing you.</p>
              <p style="margin:0;font-family:${SERIF};font-size:20px;line-height:26px;color:${c.text};">Bar <span style="color:${c.wine};">185</span></p>
            </td>
          </tr>
        </table>
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td class="pad" style="padding:18px 48px 0 48px;font-family:${SANS};font-size:12px;line-height:18px;color:${c.muted};">
              Bar 185 · ${VENUE_ADDRESS_LINES.map(escapeHtml).join(', ')}<br>
              You're receiving this email because a booking was made at Bar 185 with this address.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'BAR 185',
    'Marrickville',
    '',
    'Booking confirmed',
    '',
    `Hi ${name},`,
    '',
    introLine,
    '',
    ...detailRows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Venue',
    ...VENUE_ADDRESS_LINES,
    '',
    'Need to change your booking?',
    changeLine + (bookUrl ? ` ${bookUrl}` : ''),
    '',
    'We look forward to seeing you.',
    '',
    'Bar 185',
  ].join('\n');

  // SMS wording unchanged.
  const sms = [
    `Hi ${name}, your Bar 185 booking is confirmed.`,
    '',
    `Ref: ${bookingReference}`,
    `${shortDate}, ${start}`,
    `${guests} guests`,
    '',
    VENUE_ADDRESS_SMS,
    '',
    'See you soon — Bar 185',
  ].join('\n');

  return {
    subject: `Your Bar 185 booking is confirmed — ${bookingReference}`,
    html,
    text,
    sms,
  };
}

function verificationCode({ code, expiresInMinutes }) {
  return {
    subject: 'Your Bar 185 verification code',
    html: `
      <p>Bar 185</p>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
      <p>This code expires in ${expiresInMinutes} minutes.</p>
      <p>If you did not request this code, you can ignore this message.</p>
    `,
    text: `Bar 185. Your verification code is: ${code}. This code expires in ${expiresInMinutes} minutes. If you did not request this code, you can ignore this message.`,
    sms: `Bar 185 verification code: ${code}. Expires in ${expiresInMinutes} minutes.`,
  };
}

function largeGroupPending({ customerName, requestReference, startsAt, partySize }) {
  const date = formatDate(startsAt);
  const start = formatTime(startsAt);

  return {
    subject: 'Bar 185 — Request Received (Pending Staff Review)',
    html: `
      <p>Hi ${escapeHtml(customerName)},</p>
      <p>Thanks for your large-group request. This is <strong>not yet confirmed</strong> — our team reviews every request of this size before it's booked.</p>
      <ul>
        <li><strong>Request reference:</strong> ${requestReference}</li>
        <li><strong>Requested date:</strong> ${date}</li>
        <li><strong>Requested time:</strong> ${start}</li>
        <li><strong>Party size:</strong> ${partySize} guests</li>
      </ul>
      <p>We'll be in touch by email once it's been reviewed.</p>
      <p>— Bar 185</p>
    `,
    text: `Hi ${customerName}, we've received your large-group request (not yet confirmed — pending staff review). Reference: ${requestReference}. Requested: ${date} at ${start} for ${partySize} guests. — Bar 185`,
    sms: `Bar 185: We received your request for ${date} at ${start}, party of ${partySize}. PENDING STAFF REVIEW, not yet confirmed. Ref: ${requestReference}.`,
  };
}

function largeGroupDeclined({ customerName, requestReference, declineReason }) {
  const reasonHtml = declineReason ? `<p><strong>Reason:</strong> ${escapeHtml(declineReason)}</p>` : '';
  const reasonText = declineReason ? ` Reason: ${declineReason}.` : '';
  const reasonSms = declineReason ? ` Reason: ${declineReason}.` : '';

  return {
    subject: 'Bar 185 — Booking Request Update',
    html: `
      <p>Hi ${escapeHtml(customerName)},</p>
      <p>Unfortunately we're unable to confirm your large-group request, reference <strong>${requestReference}</strong>, at this time.</p>
      ${reasonHtml}
      <p>Please get in touch or submit a new enquiry if you'd like to try a different date or time.</p>
      <p>— Bar 185</p>
    `,
    text: `Hi ${customerName}, we're unable to confirm your large-group request (ref ${requestReference}) at this time.${reasonText} Please get in touch to try another date or time. — Bar 185`,
    sms: `Bar 185: We're unable to confirm your request (ref ${requestReference}).${reasonSms} Please get in touch to try another date/time.`,
  };
}

function bookingCancelled({ customerName, bookingReference }) {
  return {
    subject: 'Bar 185 — Booking Cancelled',
    html: `
      <p>Hi ${escapeHtml(customerName)},</p>
      <p>Your booking, reference <strong>${bookingReference}</strong>, has been cancelled.</p>
      <p>Hope to see you another time — you can book again any time on our website.</p>
      <p>— Bar 185</p>
    `,
    text: `Hi ${customerName}, your booking (ref ${bookingReference}) has been cancelled. Hope to see you another time. — Bar 185`,
    sms: `Bar 185: Your booking has been cancelled. Ref: ${bookingReference}.`,
  };
}

module.exports = {
  firstName,
  escapeHtml,
  bookingConfirmed,
  largeGroupPending,
  largeGroupDeclined,
  bookingCancelled,
  verificationCode,
};
