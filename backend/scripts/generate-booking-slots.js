// Generates real booking_slots rows from the venue's actual opening hours
// (venue_hours), for every day in the configured booking window.
//
// Nothing about the schedule is invented here -- it is all read from data
// that already exists in the schema:
//
//   - Per-weekday opening/closing hours: venue_hours (day_of_week follows
//     Postgres's own EXTRACT(DOW): 0 = Sunday ... 6 = Saturday). A closed
//     day (is_closed = TRUE, e.g. Monday) gets no slots at all.
//   - How many days ahead to generate: booking_rules.booking_window_days.
//   - Reservation duration (and therefore ends_at): booking_rules.
//     standard_booking_duration_minutes (120 minutes as seeded) -- the
//     schema's own source of truth for how long a booking runs.
//
// Business rule this script enforces: the latest valid START time on any
// day is exactly closing time minus the reservation duration (2 hours),
// so the last booking of the day naturally finishes right at closing.
// Start times run every 15 minutes from opening through that latest
// start, inclusive.
//
// Overnight closing (Thursday closes at midnight; Friday/Saturday close
// at 1:00am): venue_hours stores closes_at as a plain TIME, which can't
// itself say "the following day". This script treats closes_at <=
// opens_at as closing on the day after the service date -- the only way
// a bar's closing time would be numerically earlier than its opening
// time on the same row. Friday opens 3:00pm and closes 1:00am (the next
// calendar day); latest start = (next-day 1:00am) - 2h = 11:00pm Friday,
// which matches the required schedule.
//
// All wall-clock arithmetic is done as plain (timezone-free) timestamps
// per service date, then converted to a real instant with a single
// `AT TIME ZONE 'Australia/Sydney'`, which lets PostgreSQL's own tzdata
// (not hand-rolled JS offset math) resolve daylight saving correctly --
// the booking window spans the AEST -> AEDT transition (Oct 2026), so a
// fixed UTC offset would silently be wrong for part of it.
//
// Safe to re-run: booking_slots has a UNIQUE (venue_id, starts_at,
// ends_at) constraint, and this INSERT uses ON CONFLICT DO NOTHING, so it
// only ever adds slots that don't already exist.

const pool = require('../db');

const VENUE_REFERENCE = 'BAR185-MARRICKVILLE';

const SQL = `
  WITH venue_info AS (
    SELECT v.id AS venue_id, br.booking_window_days, br.standard_booking_duration_minutes
    FROM venues v
    JOIN booking_rules br ON br.venue_id = v.id
    WHERE v.venue_reference = $1
      AND v.is_active = TRUE
  ),
  days AS (
    SELECT (
      date_trunc('day', NOW() AT TIME ZONE 'Australia/Sydney') + INTERVAL '1 day'
      + (n || ' days')::interval
    )::date AS service_date
    FROM venue_info vi
    CROSS JOIN LATERAL generate_series(0, vi.booking_window_days - 1) AS n
  ),
  day_hours AS (
    SELECT
      d.service_date,
      vh.is_closed,
      (d.service_date + vh.opens_at) AS opens_local,
      CASE
        WHEN vh.closes_at <= vh.opens_at
          THEN (d.service_date + INTERVAL '1 day' + vh.closes_at)
        ELSE (d.service_date + vh.closes_at)
      END AS closes_local
    FROM days d
    CROSS JOIN venue_info vi
    JOIN venue_hours vh
      ON vh.venue_id = vi.venue_id
     AND vh.day_of_week = EXTRACT(DOW FROM d.service_date)::int
    WHERE vh.is_closed = FALSE
  )
  INSERT INTO booking_slots (
    venue_id, starts_at, ends_at, total_capacity, reserved_capacity, version_number, is_open
  )
  SELECT
    vi.venue_id,
    (local_start AT TIME ZONE 'Australia/Sydney'),
    (local_start AT TIME ZONE 'Australia/Sydney')
      + (vi.standard_booking_duration_minutes::text || ' minutes')::interval,
    40,
    0,
    1,
    TRUE
  FROM day_hours dh
  CROSS JOIN venue_info vi
  CROSS JOIN LATERAL generate_series(
    dh.opens_local,
    dh.closes_local - (vi.standard_booking_duration_minutes::text || ' minutes')::interval,
    INTERVAL '15 minutes'
  ) AS local_start
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
