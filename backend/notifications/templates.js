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
const EMPTY_REQUEST_VALUES = new Set(['n/a', 'na', 'none', 'null', 'undefined', 'nil', 'no', '-', '--', '.', 'nothing']);

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

// Deliberately plain transactional styling: white page, one sans-serif
// stack, near-black text, light-grey rules. The Bar 185 wine colour is used
// for the single "Book page" link only.
const EMAIL_COLORS = {
  background: '#ffffff',
  heading: '#111111', // 18.9:1 on white
  text: '#222222', // 15.9:1
  label: '#444444', // 9.7:1
  footer: '#666666', // 5.7:1
  rule: '#ececec', // decorative divider only (softened)
  link: '#6d2531', // Bar 185 wine, 10.7:1, always underlined
};

const FONT = 'Arial, Helvetica, sans-serif';

const DEPOSIT_NOTE =
  'Your A$10 deposit is redeemable at the bar on the day of your booking. If you need to cancel, please do so at least 12 hours before your booking time.';

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
  const body = `font-family:${FONT};font-size:15px;line-height:25px;color:${c.text};`;
  const sectionHeading = `margin:0 0 8px 0;font-family:${FONT};font-size:15px;line-height:22px;font-weight:bold;color:${c.heading};`;

  const rowHtml = ([label, value]) => `
                <tr>
                  <td class="row-label" width="40%" valign="top" style="padding:15px 16px 15px 0;border-bottom:1px solid ${c.rule};font-family:${FONT};font-size:14px;line-height:21px;color:${c.label};">${escapeHtml(label)}</td>
                  <td class="row-value" valign="top" style="padding:15px 0;border-bottom:1px solid ${c.rule};font-family:${FONT};font-size:15px;line-height:21px;font-weight:bold;color:${c.heading};word-break:break-word;">${escapeHtml(value)}</td>
                </tr>`;

  const linkStyle = `color:${c.link};text-decoration:underline;`;
  const changeHtml = bookUrl
    ? escapeHtml(changeLine).replace('Book page', `<a href="${escapeHtml(bookUrl)}" style="${linkStyle}">Book page</a>`)
    : escapeHtml(changeLine);

  const depositNoteHtml = deposit
    ? `
          <tr>
            <td style="padding:32px 0 0 0;">
              <p style="${sectionHeading}">Deposit note</p>
              <p style="margin:0;${body}">${escapeHtml(DEPOSIT_NOTE)}</p>
            </td>
          </tr>`
    : '';

  const preheader = `Booking ${bookingReference} confirmed: ${shortDate}, ${start}, ${guests} guests.`;

  // Production-style transactional HTML: one 600px table, inline styles,
  // Arial/Helvetica only, no images, backgrounds or web fonts. The small
  // <style> block only (a) stacks detail rows on narrow screens and
  // (b) stops Apple Mail / Gmail auto-linking the address in bright blue;
  // the email still reads correctly where it is stripped.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, address=no, email=no, date=no">
<title>Your Bar 185 booking is confirmed</title>
<style>
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  u + #body a { color: inherit; text-decoration: none; }
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .row-label, .row-value { display: block !important; width: 100% !important; }
    .outer { padding: 32px 20px !important; }
    .row-label { padding: 14px 0 0 0 !important; border-bottom: 0 !important; }
    .row-value { padding: 4px 0 14px 0 !important; }
  }
</style>
</head>
<body id="body" style="margin:0;padding:0;background-color:${c.background};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${c.background};">
    <tr>
      <td class="outer" align="center" style="padding:48px 24px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <tr>
            <td style="padding:0 0 24px 0;border-bottom:1px solid ${c.rule};">
              <p style="margin:0;font-family:${FONT};font-size:17px;line-height:22px;font-weight:bold;color:${c.heading};">Bar 185</p>
              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:21px;color:${c.label};">Marrickville</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 0 0 0;">
              <h1 style="margin:0 0 24px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:bold;color:${c.heading};">Booking confirmed</h1>
              <p style="margin:0 0 12px 0;${body}">Hi ${escapeHtml(name)},</p>
              <p style="margin:0 0 32px 0;${body}">${escapeHtml(introLine)}</p>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${c.rule};">${detailRows.map(rowHtml).join('')}
              </table>
            </td>
          </tr>${depositNoteHtml}
          <tr>
            <td style="padding:36px 0 0 0;">
              <p style="${sectionHeading}">Venue</p>
              <p style="margin:0;${body}">${VENUE_ADDRESS_LINES.map(escapeHtml).join('<br>')}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 0 0 0;">
              <p style="${sectionHeading}">Need to change your booking?</p>
              <p style="margin:0;${body}">${changeHtml}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 0 44px 0;">
              <p style="margin:0 0 12px 0;${body}">We look forward to seeing you.</p>
              <p style="margin:0;${body}">Bar 185</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 0 0;border-top:1px solid ${c.rule};font-family:${FONT};font-size:12px;line-height:20px;color:${c.footer};">
              Bar 185<br>
              ${VENUE_ADDRESS_LINES.map(escapeHtml).join(', ')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Bar 185',
    'Marrickville',
    '',
    'Booking confirmed',
    '',
    `Hi ${name},`,
    '',
    introLine,
    '',
    ...detailRows.map(([label, value]) => `${label}: ${value}`),
    ...(deposit ? ['', 'Deposit note', DEPOSIT_NOTE] : []),
    '',
    'Venue',
    ...VENUE_ADDRESS_LINES,
    '',
    'Need to change your booking?',
    changeLine + (bookUrl ? `\n${bookUrl}` : ''),
    '',
    'We look forward to seeing you.',
    '',
    'Bar 185',
    '',
    '--',
    'Bar 185',
    VENUE_ADDRESS_LINES.join(', '),
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
