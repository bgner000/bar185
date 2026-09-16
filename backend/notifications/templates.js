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

function bookingConfirmed({ customerName, bookingReference, startsAt, endsAt, partySize, followedReview }) {
  const date = formatDate(startsAt);
  const start = formatTime(startsAt);
  const end = formatTime(endsAt);

  const introLine = followedReview
    ? 'Following staff review, your table is now confirmed.'
    : 'Your table is confirmed.';

  return {
    subject: 'Bar 185 — Booking Confirmed',
    html: `
      <p>Hi ${customerName},</p>
      <p>${introLine}</p>
      <ul>
        <li><strong>Reference:</strong> ${bookingReference}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Time:</strong> ${start} – ${end}</li>
        <li><strong>Party size:</strong> ${partySize} guests</li>
      </ul>
      <p>Need to cancel? Visit the Book page on our website and use this reference with the email you booked with.</p>
      <p>— Bar 185</p>
    `,
    text: `Hi ${customerName}, ${introLine} Reference: ${bookingReference}. Date: ${date}. Time: ${start} - ${end}. Party size: ${partySize} guests. To cancel, use this reference on the Book page at bar185. — Bar 185`,
    sms: `Bar 185: Your table is confirmed for ${date} at ${start} for ${partySize} guests. Ref: ${bookingReference}.`,
  };
}

function largeGroupPending({ customerName, requestReference, startsAt, partySize }) {
  const date = formatDate(startsAt);
  const start = formatTime(startsAt);

  return {
    subject: 'Bar 185 — Request Received (Pending Staff Review)',
    html: `
      <p>Hi ${customerName},</p>
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

function largeGroupDeclined({ customerName, requestReference }) {
  return {
    subject: 'Bar 185 — Booking Request Update',
    html: `
      <p>Hi ${customerName},</p>
      <p>Unfortunately we're unable to confirm your large-group request, reference <strong>${requestReference}</strong>, at this time.</p>
      <p>Please get in touch or submit a new enquiry if you'd like to try a different date or time.</p>
      <p>— Bar 185</p>
    `,
    text: `Hi ${customerName}, we're unable to confirm your large-group request (ref ${requestReference}) at this time. Please get in touch to try another date or time. — Bar 185`,
    sms: `Bar 185: We're unable to confirm your request (ref ${requestReference}). Please get in touch to try another date/time.`,
  };
}

function bookingCancelled({ customerName, bookingReference }) {
  return {
    subject: 'Bar 185 — Booking Cancelled',
    html: `
      <p>Hi ${customerName},</p>
      <p>Your booking, reference <strong>${bookingReference}</strong>, has been cancelled.</p>
      <p>Hope to see you another time — you can book again any time on our website.</p>
      <p>— Bar 185</p>
    `,
    text: `Hi ${customerName}, your booking (ref ${bookingReference}) has been cancelled. Hope to see you another time. — Bar 185`,
    sms: `Bar 185: Your booking has been cancelled. Ref: ${bookingReference}.`,
  };
}

module.exports = {
  bookingConfirmed,
  largeGroupPending,
  largeGroupDeclined,
  bookingCancelled,
};
