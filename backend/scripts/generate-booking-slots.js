// Generates real booking_slots rows for every 15-minute start time from
// 5:00pm through 9:00pm (Australia/Sydney) for each day in the venue's
// configured booking window.
//
// Nothing here is invented:
//   - The 17:00-21:00 / 15-minute schedule is the requirement this script
//     was written to satisfy.
//   - The slot DURATION (and therefore ends_at) comes from the existing
//     booking_rules.standard_booking_duration_minutes column (120 minutes
//     as seeded) -- the schema's own source of truth for how long a
//     standard booking runs, not a new guess.
//   - The number of days generated comes from the existing
//     booking_rules.booking_window_days column (90 days as seeded), the
//     same value POST /api/v1/bookings and the large-group endpoint
//     already enforce server-side.
//
// Capacity model: each generated slot gets its own independent
// total_capacity (40, matching the venue's existing seeded slots) and
// reserved_capacity, exactly like the two blocks seeded in database/seed.sql.
// This preserves the current booking_slots design as-is rather than
// redesigning it. One consequence worth knowing: because adjacent 15-minute
// slots overlap in real time (a 5:00pm booking and a 5:15pm booking both
// occupy the venue until ~7:00pm/7:15pm), their capacity is tracked
// independently rather than against one shared pool for that window. That
// mirrors how the original 6pm/8pm two-block seed already worked and is a
// reasonable simplification for this university/demo release; a real
// deployment would eventually want table-level allocation (the schema
// already has venue_tables / booking_table_allocations for that) rather
// than per-slot capacity.
//
// Safe to re-run: booking_slots has a UNIQUE (venue_id, starts_at, ends_at)
// constraint, and this INSERT uses ON CONFLICT DO NOTHING, so it only ever
// adds slots that don't already exist.

const pool = require('../db');

const VENUE_REFERENCE = 'BAR185-MARRICKVILLE';

const SQL = `
  INSERT INTO booking_slots (
    venue_id, starts_at, ends_at, total_capacity, reserved_capacity, version_number, is_open
  )
  SELECT
    v.id,
    (local_slot AT TIME ZONE 'Australia/Sydney'),
    (local_slot AT TIME ZONE 'Australia/Sydney')
      + (br.standard_booking_duration_minutes::text || ' minutes')::interval,
    40,
    0,
    1,
    TRUE
  FROM venues v
  JOIN booking_rules br ON br.venue_id = v.id
  CROSS JOIN LATERAL generate_series(
    date_trunc('day', NOW() AT TIME ZONE 'Australia/Sydney') + INTERVAL '1 day',
    date_trunc('day', NOW() AT TIME ZONE 'Australia/Sydney')
      + (br.booking_window_days::text || ' days')::interval,
    INTERVAL '1 day'
  ) AS day
  CROSS JOIN LATERAL generate_series(
    day + INTERVAL '17 hours',
    day + INTERVAL '21 hours',
    INTERVAL '15 minutes'
  ) AS local_slot
  WHERE v.venue_reference = $1
    AND v.is_active = TRUE
  ON CONFLICT (venue_id, starts_at, ends_at) DO NOTHING
  RETURNING id;
`;

async function main() {
  const result = await pool.query(SQL, [VENUE_REFERENCE]);
  console.log(`Inserted ${result.rowCount} new booking slot(s). Existing slots were left untouched.`);
  await pool.end();
}

main().catch((error) => {
  console.error('Failed to generate booking slots:', error.message);
  process.exitCode = 1;
});
