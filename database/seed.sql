-- =========================================================
-- Bar 185 Initial Seed Data
-- =========================================================

BEGIN;

-- =========================================================
-- 1. STAFF ROLES
-- =========================================================

INSERT INTO roles (
  role_code,
  role_name,
  description
)
VALUES
  (
    'admin',
    'Administrator',
    'Full administrative access to the Bar 185 management system.'
  ),
  (
    'staff',
    'Staff',
    'Operational staff access to permitted Bar 185 management functions.'
  );

COMMIT;

-- =========================================================
-- 2. DEMO VENUE
-- =========================================================

BEGIN;

INSERT INTO venues (
  venue_reference,
  venue_name,
  address_line1,
  suburb,
  state,
  postcode,
  country,
  public_phone,
  public_email,
  timezone,
  is_active
)
VALUES (
  'BAR185-MARRICKVILLE',
  'Bar 185',
  'Project Demo Address',
  'Marrickville',
  'NSW',
  '2204',
  'Australia',
  NULL,
  NULL,
  'Australia/Sydney',
  TRUE
)
ON CONFLICT (venue_reference) DO NOTHING;

-- =========================================================
-- 3. DEMO BOOKING SLOTS
-- =========================================================

INSERT INTO booking_slots (
  venue_id,
  starts_at,
  ends_at,
  total_capacity,
  reserved_capacity,
  version_number,
  is_open
)
SELECT
  id,
  '2026-09-12 18:00:00+10',
  '2026-09-12 20:00:00+10',
  40,
  0,
  1,
  TRUE
FROM venues
WHERE venue_reference = 'BAR185-MARRICKVILLE'
ON CONFLICT (venue_id, starts_at, ends_at) DO NOTHING;

INSERT INTO booking_slots (
  venue_id,
  starts_at,
  ends_at,
  total_capacity,
  reserved_capacity,
  version_number,
  is_open
)
SELECT
  id,
  '2026-09-12 20:00:00+10',
  '2026-09-12 22:00:00+10',
  40,
  0,
  1,
  TRUE
FROM venues
WHERE venue_reference = 'BAR185-MARRICKVILLE'
ON CONFLICT (venue_id, starts_at, ends_at) DO NOTHING;

INSERT INTO booking_slots (
  venue_id,
  starts_at,
  ends_at,
  total_capacity,
  reserved_capacity,
  version_number,
  is_open
)
SELECT
  id,
  '2026-09-13 18:00:00+10',
  '2026-09-13 20:00:00+10',
  40,
  0,
  1,
  TRUE
FROM venues
WHERE venue_reference = 'BAR185-MARRICKVILLE'
ON CONFLICT (venue_id, starts_at, ends_at) DO NOTHING;

COMMIT;
-- =========================================================
-- 4. BOOKING RULES
-- =========================================================

BEGIN;

INSERT INTO booking_rules (
  venue_id,
  minimum_party_size,
  maximum_standard_party_size,
  large_group_threshold,
  booking_window_days,
  slot_interval_minutes,
  standard_booking_duration_minutes,
  public_instructions
)
SELECT
  id,
  1,
  8,
  9,
  90,
  30,
  120,
  'Standard bookings for up to 8 guests may be confirmed instantly when capacity is available. Groups of 9 or more require staff review.'
FROM venues
WHERE venue_reference = 'BAR185-MARRICKVILLE'
ON CONFLICT (venue_id) DO UPDATE SET
  minimum_party_size = EXCLUDED.minimum_party_size,
  maximum_standard_party_size = EXCLUDED.maximum_standard_party_size,
  large_group_threshold = EXCLUDED.large_group_threshold,
  booking_window_days = EXCLUDED.booking_window_days,
  slot_interval_minutes = EXCLUDED.slot_interval_minutes,
  standard_booking_duration_minutes = EXCLUDED.standard_booking_duration_minutes,
  public_instructions = EXCLUDED.public_instructions,
  updated_at = NOW();

COMMIT; 
-- =========================================================
-- 5. DEMO ADMIN ACCOUNT
-- =========================================================

BEGIN;

INSERT INTO users (
  display_name,
  email,
  status
)
VALUES (
  'Bar 185 Admin',
  'admin@bar185.local',
  'active'
)
ON CONFLICT (email) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = 'active',
  updated_at = NOW();

INSERT INTO staff_accounts (
  user_id,
  staff_reference,
  status,
  approved_at
)
SELECT
  id,
  'B185-ADMIN-001',
  'approved',
  NOW()
FROM users
WHERE email = 'admin@bar185.local'
ON CONFLICT (user_id) DO UPDATE SET
  status = 'approved',
  approved_at = COALESCE(staff_accounts.approved_at, NOW()),
  disabled_at = NULL,
  removed_at = NULL,
  updated_at = NOW();

INSERT INTO user_roles (
  user_id,
  role_id
)
SELECT
  u.id,
  r.id
FROM users u
JOIN roles r
  ON r.role_code = 'admin'
WHERE u.email = 'admin@bar185.local'
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT; 
-- =========================================================
-- 6. DEMO VENUE TABLES
-- =========================================================

BEGIN;

INSERT INTO venue_tables (
  venue_id,
  table_code,
  table_name,
  capacity,
  status
)
SELECT
  v.id,
  table_data.table_code,
  table_data.table_name,
  table_data.capacity,
  'active'
FROM venues v
CROSS JOIN (
  VALUES
    ('T01', 'Table 1', 2),
    ('T02', 'Table 2', 2),
    ('T03', 'Table 3', 2),
    ('T04', 'Table 4', 2),
    ('T05', 'Table 5', 4),
    ('T06', 'Table 6', 4),
    ('T07', 'Table 7', 4),
    ('T08', 'Table 8', 4),
    ('T09', 'Table 9', 4),
    ('T10', 'Table 10', 6),
    ('T11', 'Table 11', 6)
) AS table_data (
  table_code,
  table_name,
  capacity
)
WHERE v.venue_reference = 'BAR185-MARRICKVILLE'

ON CONFLICT (venue_id, table_code) DO UPDATE SET
  table_name = EXCLUDED.table_name,
  capacity = EXCLUDED.capacity,
  status = 'active',
  updated_at = NOW();

COMMIT;
