// Releases expired, unpaid deposit holds for one slot. A "hold" is just a
// bookings row with status = 'pending' and hold_expires_at set (see
// migration 15) -- there's no separate hold table, so releasing one means
// doing exactly what cancelling a real booking already does: give the
// capacity back and record why, using the same 'cancelled' status the
// rest of the app already knows how to filter out of everything that
// matters (availability, revenue, "upcoming" admin views).
//
// This is a lazy sweep, not a background job: there's no scheduler
// anywhere in this codebase, so instead this runs at the start of any
// capacity check for the affected slot (both booking-creation routes call
// it, right after locking the slot row) -- by the time anyone needs to
// know how many seats are really free, expired holds have already been
// cleaned up in the same transaction. Stripe's own checkout.session.expired
// webhook (see server.js) does the same release sooner, when Stripe tells
// us directly; this is the fallback for whenever that webhook doesn't
// arrive (or hasn't yet).
async function releaseExpiredHolds(client, slotId) {
  const expired = await client.query(
    `
    SELECT id, party_size
    FROM bookings
    WHERE booking_slot_id = $1
      AND status = 'pending'
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at < NOW()
    FOR UPDATE
    `,
    [slotId]
  );

  for (const row of expired.rows) {
    await client.query(
      `
      UPDATE bookings
      SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancel_reason = 'Deposit payment window expired',
        updated_at = NOW()
      WHERE id = $1
      `,
      [row.id]
    );

    await client.query(
      `
      UPDATE booking_slots
      SET
        reserved_capacity = GREATEST(reserved_capacity - $1, 0),
        version_number = version_number + 1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [row.party_size, slotId]
    );
  }

  return expired.rowCount;
}

module.exports = { releaseExpiredHolds };
