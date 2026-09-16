const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('./db');
const notifications = require('./notifications');
const { saveMenuFile, STORAGE_DIR, PUBLIC_PREFIX } = require('./menu/storage');

const app = express();
const PORT = 3000;

const menuUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, or PNG files are allowed'));
    }
  }
});

app.use(express.json());
app.use(cors());
app.use(PUBLIC_PREFIX, express.static(STORAGE_DIR));
const requireApprovedAdmin = async (req, res, next) => {
  const email = req.get('X-Demo-User-Email');

  if (!email) {
    return res.status(401).json({
      status: 'failed',
      message: 'Admin authentication required'
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.display_name,
        u.email,
        u.status AS user_status,
        sa.status AS staff_status,
        r.role_code
      FROM users u
      JOIN staff_accounts sa
        ON sa.user_id = u.id
      JOIN user_roles ur
        ON ur.user_id = u.id
      JOIN roles r
        ON r.id = ur.role_id
      WHERE LOWER(u.email) = LOWER($1)
        AND u.status = 'active'
        AND sa.status = 'approved'
        AND r.role_code = 'admin'
      LIMIT 1
      `,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(403).json({
        status: 'failed',
        message: 'Approved admin access required'
      });
    }

    req.adminUser = result.rows[0];
    next();
  } catch (error) {
    console.error('Admin authorization error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not verify admin access'
    });
  }
};


app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Bar 185 API'
  });
});

app.get('/api/v1/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS database_time');

    res.status(200).json({
      status: 'connected',
      database: 'PostgreSQL',
      databaseTime: result.rows[0].database_time
    });
  } catch (error) {
    console.error('Database connection error:', error.message);

    res.status(500).json({
      status: 'database connection failed'
    });
  }
});
app.get('/api/v1/booking-slots', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        bs.id,
        bs.starts_at,
        bs.ends_at,
        bs.total_capacity,
        bs.reserved_capacity,
        bs.is_open,
        v.venue_name
      FROM booking_slots bs
      JOIN venues v
        ON v.id = bs.venue_id
      WHERE bs.is_open = TRUE
        AND bs.starts_at > NOW()
      ORDER BY bs.starts_at ASC
    `);

    res.status(200).json({
      slots: result.rows
    });
  } catch (error) {
    console.error('Booking slots error:', error.message);

    res.status(500).json({
      status: 'failed',
      message: 'Could not load booking slots'
    });
  }
});
app.get('/api/v1/venue-hours', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        vh.day_of_week,
        vh.opens_at,
        vh.closes_at,
        vh.is_closed,
        v.timezone
      FROM venue_hours vh
      JOIN venues v
        ON v.id = vh.venue_id
      WHERE v.venue_reference = 'BAR185-MARRICKVILLE'
        AND v.is_active = TRUE
      ORDER BY vh.day_of_week ASC
    `);

    res.status(200).json({
      hours: result.rows
    });
  } catch (error) {
    console.error('Venue hours error:', error.message);

    res.status(500).json({
      status: 'failed',
      message: 'Could not load venue hours'
    });
  }
});

app.post('/api/v1/bookings', async (req, res) => {
  const {
    bookingSlotId,
    partySize,
    customerName,
    customerEmail,
    customerPhone,
    specialRequests
  } = req.body;

  const slotId = Number(bookingSlotId);
  const requestedPartySize = Number(partySize);

  if (
    !Number.isInteger(slotId) ||
    slotId < 1 ||
    !Number.isInteger(requestedPartySize) ||
    requestedPartySize < 1 ||
    typeof customerName !== 'string' ||
    customerName.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Valid booking slot, party size, customer name and email are required'
    });
  }

  let client;

  try {
    client = await pool.connect();

    await client.query('BEGIN');

    const slotResult = await client.query(
      `
      SELECT
        bs.id,
        bs.starts_at,
        bs.ends_at,
        bs.total_capacity,
        bs.reserved_capacity,
        bs.is_open,
        br.minimum_party_size,
        br.maximum_standard_party_size,
        br.large_group_threshold,
        br.booking_window_days
      FROM booking_slots bs
      JOIN booking_rules br
        ON br.venue_id = bs.venue_id
      WHERE bs.id = $1
      FOR UPDATE OF bs
      `,
      [slotId]
    );

    if (slotResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        status: 'failed',
        message: 'Booking slot not found'
      });
    }

    const slot = slotResult.rows[0];

    if (!slot.is_open) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'This booking slot is closed'
      });
    }

    const slotStart = new Date(slot.starts_at);
    const now = new Date();

    if (slotStart <= now) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'This booking slot is no longer available'
      });
    }

    const bookingWindowEnd = new Date(
      now.getTime() + Number(slot.booking_window_days) * 24 * 60 * 60 * 1000
    );

    if (slotStart > bookingWindowEnd) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: 'This booking is outside the permitted booking window'
      });
    }

    if (requestedPartySize < Number(slot.minimum_party_size)) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: `Minimum party size is ${slot.minimum_party_size}`
      });
    }

    if (
      requestedPartySize > Number(slot.maximum_standard_party_size) ||
      requestedPartySize >= Number(slot.large_group_threshold)
    ) {
      await client.query('ROLLBACK');

      return res.status(422).json({
        status: 'large_group_required',
        message: 'This party size requires a large-group booking request',
        nextEndpoint: '/api/v1/large-group-booking-requests'
      });
    }

    const availableCapacity =
      Number(slot.total_capacity) - Number(slot.reserved_capacity);

    if (requestedPartySize > availableCapacity) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: 'Not enough capacity is available for this booking'
      });
    }

    const bookingReference =
      'B185-' + crypto.randomBytes(5).toString('hex').toUpperCase();

    const bookingResult = await client.query(
      `
      INSERT INTO bookings (
        booking_reference,
        booking_slot_id,
        booking_type,
        status,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        special_requests,
        confirmed_at
      )
      VALUES (
        $1,
        $2,
        'standard',
        'confirmed',
        $3,
        $4,
        $5,
        $6,
        $7,
        NOW()
      )
      RETURNING
        id,
        booking_reference,
        booking_slot_id,
        booking_type,
        status,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        special_requests,
        confirmed_at,
        created_at
      `,
      [
        bookingReference,
        slotId,
        requestedPartySize,
        customerName.trim(),
        customerEmail.trim(),
        customerPhone?.trim() || null,
        specialRequests?.trim() || null
      ]
    );

    await client.query(
      `
      UPDATE booking_slots
      SET
        reserved_capacity = reserved_capacity + $1,
        version_number = version_number + 1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [requestedPartySize, slotId]
    );

    await client.query('COMMIT');

    await notifications.notifyBookingConfirmed(bookingResult.rows[0], slot);

    return res.status(201).json({
      status: 'confirmed',
      booking: bookingResult.rows[0]
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    console.error('Create booking error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not create booking'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});
app.post('/api/v1/large-group-booking-requests', async (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key');

  const {
    bookingDate,
    slotStartAt,
    partySize,
    customerName,
    customerPhone,
    customerEmail
  } = req.body;

  if (!idempotencyKey || idempotencyKey.trim() === '') {
    return res.status(400).json({
      status: 'failed',
      message: 'Idempotency-Key header is required'
    });
  }

  const requestedPartySize = Number(partySize);
  const slotStart = new Date(slotStartAt);

  if (
    typeof bookingDate !== 'string' ||
    bookingDate.trim() === '' ||
    Number.isNaN(slotStart.getTime()) ||
    !Number.isInteger(requestedPartySize) ||
    requestedPartySize < 1 ||
    typeof customerName !== 'string' ||
    customerName.trim() === '' ||
    typeof customerPhone !== 'string' ||
    customerPhone.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Valid booking date, start time, party size, name, phone and email are required'
    });
  }

  const requestPayload = {
    bookingDate,
    slotStartAt,
    partySize: requestedPartySize,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerEmail: customerEmail.trim()
  };

  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(requestPayload))
    .digest('hex');

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [idempotencyKey]
    );

    const existingKey = await client.query(
      `
      SELECT
        request_hash,
        status,
        response_status_code,
        response_body
      FROM idempotency_keys
      WHERE idempotency_key = $1
      `,
      [idempotencyKey]
    );

    if (existingKey.rowCount > 0) {
      const existing = existingKey.rows[0];

      if (
        existing.request_hash &&
        existing.request_hash !== requestHash
      ) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: 'This Idempotency-Key was already used for a different request'
        });
      }

      if (existing.status === 'completed') {
        await client.query('COMMIT');

        return res
          .status(existing.response_status_code)
          .json(existing.response_body);
      }

      await client.query(
        `
        UPDATE idempotency_keys
        SET
          request_hash = $2,
          status = 'processing',
          updated_at = NOW()
        WHERE idempotency_key = $1
        `,
        [idempotencyKey, requestHash]
      );
    } else {
      await client.query(
        `
        INSERT INTO idempotency_keys (
          idempotency_key,
          request_method,
          request_path,
          request_hash,
          status,
          expires_at
        )
        VALUES (
          $1,
          'POST',
          '/api/v1/large-group-booking-requests',
          $2,
          'processing',
          NOW() + INTERVAL '24 hours'
        )
        `,
        [idempotencyKey, requestHash]
      );
    }

    const venueResult = await client.query(
      `
      SELECT
        v.id AS venue_id,
        br.large_group_threshold,
        br.booking_window_days
      FROM venues v
      JOIN booking_rules br
        ON br.venue_id = v.id
      WHERE v.venue_reference = 'BAR185-MARRICKVILLE'
        AND v.is_active = TRUE
      `
    );

    if (venueResult.rowCount === 0) {
      throw new Error('Venue or booking rules not configured');
    }

    const venue = venueResult.rows[0];

    if (
      requestedPartySize <
      Number(venue.large_group_threshold)
    ) {
      await client.query('ROLLBACK');

      return res.status(422).json({
        status: 'failed',
        message: `Large-group requests require at least ${venue.large_group_threshold} guests`
      });
    }

    const now = new Date();

    if (slotStart <= now) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: 'Requested booking time must be in the future'
      });
    }

    const bookingWindowEnd = new Date(
      now.getTime() +
        Number(venue.booking_window_days) *
          24 *
          60 *
          60 *
          1000
    );

    if (slotStart > bookingWindowEnd) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        status: 'failed',
        message: 'Requested booking is outside the permitted booking window'
      });
    }

    const requestReference =
      'B185-LG-' +
      crypto.randomBytes(5).toString('hex').toUpperCase();

    const requestResult = await client.query(
      `
      INSERT INTO large_group_booking_requests (
        request_reference,
        venue_id,
        booking_date,
        slot_start_at,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'pending'
      )
      RETURNING
        id,
        request_reference,
        booking_date,
        slot_start_at,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        status,
        created_at
      `,
      [
        requestReference,
        venue.venue_id,
        bookingDate,
        slotStartAt,
        requestedPartySize,
        customerName.trim(),
        customerEmail.trim(),
        customerPhone.trim()
      ]
    );

    const responseBody = {
      status: 'pending',
      message: 'Large-group booking request submitted for staff review',
      request: requestResult.rows[0]
    };

    await client.query(
      `
      UPDATE idempotency_keys
      SET
        status = 'completed',
        response_status_code = 201,
        response_body = $2::jsonb,
        updated_at = NOW()
      WHERE idempotency_key = $1
      `,
      [idempotencyKey, JSON.stringify(responseBody)]
    );

    await client.query('COMMIT');

    await notifications.notifyLargeGroupPending(requestResult.rows[0]);

    return res.status(201).json(responseBody);
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    console.error(
      'Large-group booking request error:',
      error.message
    );

    return res.status(500).json({
      status: 'failed',
      message: 'Could not submit large-group booking request'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});
app.post('/api/v1/event-enquiries', async (req, res) => {
  const {
    customerName,
    customerEmail,
    customerPhone,
    eventType,
    preferredStartAt,
    preferredEndAt,
    expectedGuestCount,
    message
  } = req.body;

  const guestCount = Number(expectedGuestCount);

  if (
    typeof customerName !== 'string' ||
    customerName.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === '' ||
    typeof message !== 'string' ||
    message.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Name, email and enquiry message are required'
    });
  }

  if (
    expectedGuestCount !== undefined &&
    expectedGuestCount !== null &&
    expectedGuestCount !== '' &&
    (!Number.isInteger(guestCount) || guestCount < 1)
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Expected guest count must be a positive whole number'
    });
  }

  if (
    preferredStartAt &&
    Number.isNaN(new Date(preferredStartAt).getTime())
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Preferred start time is invalid'
    });
  }

  if (
    preferredEndAt &&
    Number.isNaN(new Date(preferredEndAt).getTime())
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Preferred end time is invalid'
    });
  }

  if (
    preferredStartAt &&
    preferredEndAt &&
    new Date(preferredEndAt) <= new Date(preferredStartAt)
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Preferred end time must be after the start time'
    });
  }

  try {
    const enquiryReference =
      'B185-EQ-' +
      crypto.randomBytes(5).toString('hex').toUpperCase();

    const result = await pool.query(
      `
      INSERT INTO event_enquiries (
        enquiry_reference,
        customer_name,
        customer_email,
        customer_phone,
        event_type,
        preferred_start_at,
        preferred_end_at,
        expected_guest_count,
        message,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        'new'
      )
      RETURNING
        id,
        enquiry_reference,
        customer_name,
        customer_email,
        customer_phone,
        event_type,
        preferred_start_at,
        preferred_end_at,
        expected_guest_count,
        message,
        status,
        created_at
      `,
      [
        enquiryReference,
        customerName.trim(),
        customerEmail.trim(),
        customerPhone?.trim() || null,
        eventType?.trim() || null,
        preferredStartAt || null,
        preferredEndAt || null,
        expectedGuestCount === undefined ||
        expectedGuestCount === null ||
        expectedGuestCount === ''
          ? null
          : guestCount,
        message.trim()
      ]
    );

    return res.status(201).json({
      status: 'submitted',
      message: 'Event enquiry submitted for staff review',
      enquiry: result.rows[0]
    });
  } catch (error) {
    console.error('Event enquiry error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not submit event enquiry'
    });
  }
});

app.get(
  '/api/v1/admin/dashboard',
  requireApprovedAdmin,
  async (req, res) => {
    try {
      const [
        bookingsResult,
        largeGroupsResult,
        enquiriesResult
      ] = await Promise.all([
        pool.query(`
          SELECT
            b.id,
            b.booking_reference,
            b.status,
            b.party_size,
            b.customer_name,
            b.customer_email,
            b.customer_phone,
            bs.starts_at,
            bs.ends_at
          FROM bookings b
          JOIN booking_slots bs
          ON bs.id = b.booking_slot_id
          WHERE b.status IN ('pending', 'confirmed')
          ORDER BY bs.starts_at ASC 
        `),

        pool.query(`
          SELECT
            id,
            request_reference,
            booking_date,
            slot_start_at,
            party_size,
            customer_name,
            customer_email,
            customer_phone,
            status,
            decline_reason,
            reviewed_at,
            created_at
          FROM large_group_booking_requests
          ORDER BY created_at DESC
        `),

        pool.query(`
          SELECT
            id,
            enquiry_reference,
            customer_name,
            customer_email,
            customer_phone,
            event_type,
            preferred_start_at,
            preferred_end_at,
            expected_guest_count,
            message,
            status,
            created_at
          FROM event_enquiries
          ORDER BY created_at DESC
        `)
      ]);

      return res.status(200).json({
        status: 'ok',
        admin: {
          id: req.adminUser.id,
          displayName: req.adminUser.display_name,
          role: req.adminUser.role_code
        },
        dashboard: {
          bookings: bookingsResult.rows,
          largeGroupRequests: largeGroupsResult.rows,
          eventEnquiries: enquiriesResult.rows
        }
      });
    } catch (error) {
      console.error('Admin dashboard error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load admin dashboard'
      });
    }
  }
);
app.patch('/api/v1/bookings/:bookingReference/cancel', async (req, res) => {
  const { bookingReference } = req.params;
  const { customerEmail } = req.body;

  if (
    typeof bookingReference !== 'string' ||
    bookingReference.trim() === '' ||
    typeof customerEmail !== 'string' ||
    customerEmail.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: 'Booking reference and customer email are required'
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const bookingResult = await client.query(
      `
      SELECT
        id,
        booking_reference,
        booking_slot_id,
        party_size,
        customer_name,
        customer_email,
        customer_phone,
        status
      FROM bookings
      WHERE booking_reference = $1
      FOR UPDATE
      `,
      [bookingReference.trim()]
    );

    if (bookingResult.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        status: 'failed',
        message: 'Booking not found'
      });
    }

    const booking = bookingResult.rows[0];

    if (
      booking.customer_email.toLowerCase() !==
      customerEmail.trim().toLowerCase()
    ) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        status: 'failed',
        message: 'Booking not found'
      });
    }

    if (booking.status === 'cancelled') {
      await client.query('COMMIT');

      return res.status(200).json({
        status: 'cancelled',
        message: 'Booking is already cancelled',
        bookingReference: booking.booking_reference
      });
    }

    if (booking.status !== 'confirmed') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        status: 'failed',
        message: `Booking cannot be cancelled from status ${booking.status}`
      });
    }

    await client.query(
      `
      UPDATE booking_slots
      SET
        reserved_capacity =
          GREATEST(reserved_capacity - $1, 0),
        version_number = version_number + 1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [
        booking.party_size,
        booking.booking_slot_id
      ]
    );

    await client.query(
      `
      DELETE FROM booking_table_allocations
      WHERE booking_id = $1
      `,
      [booking.id]
    );

    await client.query(
      `
      UPDATE bookings
      SET
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = $1
      `,
      [booking.id]
    );

    await client.query('COMMIT');

    await notifications.notifyBookingCancelled(booking);

    return res.status(200).json({
      status: 'cancelled',
      message: 'Booking cancelled successfully',
      bookingReference: booking.booking_reference
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }

    console.error('Cancel booking error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not cancel booking'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});
app.patch(
  '/api/v1/admin/large-group-booking-requests/:requestReference/approve',
  requireApprovedAdmin,
  async (req, res) => {
    const { requestReference } = req.params;

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const requestResult = await client.query(
        `
        SELECT
          id,
          request_reference,
          venue_id,
          slot_start_at,
          party_size,
          customer_name,
          customer_email,
          customer_phone,
          status,
          approved_booking_id
        FROM large_group_booking_requests
        WHERE request_reference = $1
        FOR UPDATE
        `,
        [requestReference]
      );

      if (requestResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Large-group request not found'
        });
      }

      const request = requestResult.rows[0];

      if (
        request.status === 'confirmed' &&
        request.approved_booking_id
      ) {
        const existingBooking = await client.query(
          `
          SELECT
            id,
            booking_reference,
            status,
            party_size
          FROM bookings
          WHERE id = $1
          `,
          [request.approved_booking_id]
        );

        await client.query('COMMIT');

        return res.status(200).json({
          status: 'confirmed',
          message: 'Large-group request is already approved',
          booking: existingBooking.rows[0]
        });
      }

      if (request.status !== 'pending') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Request cannot be approved from status ${request.status}`
        });
      }

      const slotResult = await client.query(
        `
        SELECT
          id,
          starts_at,
          ends_at,
          total_capacity,
          reserved_capacity,
          is_open
        FROM booking_slots
        WHERE venue_id = $1
          AND starts_at = $2
        ORDER BY ends_at ASC
        LIMIT 1
        FOR UPDATE
        `,
        [
          request.venue_id,
          request.slot_start_at
        ]
      );

      if (slotResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: 'Matching booking slot is no longer available'
        });
      }

      const slot = slotResult.rows[0];

      if (!slot.is_open) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: 'Booking slot is closed'
        });
      }

      const availableCapacity =
        Number(slot.total_capacity) -
        Number(slot.reserved_capacity);

      if (Number(request.party_size) > availableCapacity) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Insufficient capacity. Only ${availableCapacity} seats remain`
        });
      }

      const bookingReference =
        'B185-' +
        crypto.randomBytes(5).toString('hex').toUpperCase();

      const bookingResult = await client.query(
        `
        INSERT INTO bookings (
          booking_reference,
          booking_slot_id,
          booking_type,
          status,
          party_size,
          customer_name,
          customer_email,
          customer_phone,
          special_requests,
          reviewed_by_user_id,
          confirmed_at
        )
        VALUES (
          $1,
          $2,
          'large_group',
          'confirmed',
          $3,
          $4,
          $5,
          $6,
          NULL,
          $7,
          NOW()
        )
        RETURNING
          id,
          booking_reference,
          booking_slot_id,
          booking_type,
          status,
          party_size,
          customer_name,
          customer_email,
          customer_phone,
          confirmed_at,
          created_at
        `,
        [
          bookingReference,
          slot.id,
          request.party_size,
          request.customer_name,
          request.customer_email,
          request.customer_phone,
          req.adminUser.id
        ]
      );

      await client.query(
        `
        UPDATE booking_slots
        SET
          reserved_capacity =
            reserved_capacity + $1,
          version_number =
            version_number + 1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          request.party_size,
          slot.id
        ]
      );

      await client.query(
        `
        UPDATE large_group_booking_requests
        SET
          status = 'confirmed',
          reviewed_by_user_id = $1,
          approved_booking_id = $2,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          req.adminUser.id,
          bookingResult.rows[0].id,
          request.id
        ]
      );

      await client.query('COMMIT');

      await notifications.notifyBookingConfirmed(bookingResult.rows[0], slot);

      return res.status(200).json({
        status: 'confirmed',
        message: 'Large-group booking approved',
        booking: bookingResult.rows[0]
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error(
        'Approve large-group request error:',
        error.message
      );

      return res.status(500).json({
        status: 'failed',
        message: 'Could not approve large-group request'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

app.patch(
  '/api/v1/admin/large-group-booking-requests/:requestReference/decline',
  requireApprovedAdmin,
  async (req, res) => {
    const { requestReference } = req.params;
    const { reason } = req.body;

    if (typeof reason !== 'string' || reason.trim() === '') {
      return res.status(400).json({
        status: 'failed',
        message: 'A decline reason is required'
      });
    }

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const requestResult = await client.query(
        `
        SELECT
          id,
          request_reference,
          status,
          customer_name,
          customer_email,
          customer_phone,
          decline_reason
        FROM large_group_booking_requests
        WHERE request_reference = $1
        FOR UPDATE
        `,
        [requestReference]
      );

      if (requestResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Large-group request not found'
        });
      }

      const request = requestResult.rows[0];

      if (request.status === 'declined') {
        await client.query('COMMIT');

        return res.status(200).json({
          status: 'declined',
          message: 'Large-group request is already declined',
          requestReference: request.request_reference
        });
      }

      if (request.status !== 'pending') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Request cannot be declined from status ${request.status}`
        });
      }

      await client.query(
        `
        UPDATE large_group_booking_requests
        SET
          status = 'declined',
          reviewed_by_user_id = $1,
          reviewed_at = NOW(),
          decline_reason = $3,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          req.adminUser.id,
          request.id,
          reason.trim()
        ]
      );

      await client.query('COMMIT');

      await notifications.notifyLargeGroupDeclined(request);

      return res.status(200).json({
        status: 'declined',
        message: 'Large-group booking request declined',
        requestReference: request.request_reference
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error(
        'Decline large-group request error:',
        error.message
      );

      return res.status(500).json({
        status: 'failed',
        message: 'Could not decline large-group request'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
); 
app.patch(
  '/api/v1/admin/event-enquiries/:enquiryReference/status',
  requireApprovedAdmin,
  async (req, res) => {
    const { enquiryReference } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      'acknowledged',
      'in_review',
      'contacted',
      'quoted',
      'closed',
      'declined'
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        status: 'failed',
        message: 'Invalid event enquiry status',
        allowedStatuses
      });
    }

    try {
      const result = await pool.query(
        `
        UPDATE event_enquiries
        SET
          status = $1,
          assigned_to_user_id = COALESCE(
            assigned_to_user_id,
            $2
          ),
          reviewed_at = COALESCE(
            reviewed_at,
            NOW()
          ),
          updated_at = NOW()
        WHERE enquiry_reference = $3
        RETURNING
          id,
          enquiry_reference,
          customer_name,
          customer_email,
          customer_phone,
          event_type,
          preferred_start_at,
          preferred_end_at,
          expected_guest_count,
          message,
          status,
          assigned_to_user_id,
          reviewed_at,
          created_at,
          updated_at
        `,
        [
          status,
          req.adminUser.id,
          enquiryReference
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          status: 'failed',
          message: 'Event enquiry not found'
        });
      }

      return res.status(200).json({
        status: 'ok',
        message: 'Event enquiry status updated',
        enquiry: result.rows[0]
      });

    } catch (error) {
      console.error(
        'Update event enquiry status error:',
        error.message
      );

      return res.status(500).json({
        status: 'failed',
        message: 'Could not update event enquiry status'
      });
    }
  }
);

app.get(
  '/api/v1/admin/bookings',
  requireApprovedAdmin,
  async (req, res) => {
    const { date } = req.query;
    const serviceDate = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : null;

    if (!serviceDate) {
      return res.status(400).json({
        status: 'failed',
        message: 'A date query parameter (YYYY-MM-DD) is required'
      });
    }

    try {
      const result = await pool.query(
        `
        SELECT
          b.id,
          b.booking_reference,
          b.booking_type,
          b.status,
          b.party_size,
          b.customer_name,
          b.customer_email,
          b.customer_phone,
          b.special_requests,
          b.seated_at,
          b.completed_at,
          b.no_show_at,
          b.cancelled_at,
          b.cancel_reason,
          bs.starts_at,
          bs.ends_at
        FROM bookings b
        JOIN booking_slots bs
          ON bs.id = b.booking_slot_id
        WHERE bs.starts_at >= ($1::date)::timestamp AT TIME ZONE 'Australia/Sydney'
          AND bs.starts_at < ($1::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Australia/Sydney'
        ORDER BY bs.starts_at ASC
        `,
        [serviceDate]
      );

      return res.status(200).json({
        status: 'ok',
        serviceDate,
        bookings: result.rows
      });
    } catch (error) {
      console.error('Admin bookings-by-date error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load bookings for that date'
      });
    }
  }
);

// Booking operational status transitions staff may perform from the admin
// dashboard. Anything not listed here (e.g. leaving 'cancelled' or
// 'no_show') is a dead end -- enforced here, not just by hiding buttons in
// the UI, since the frontend hiding a control is not a security boundary.
// 'seated' -> 'confirmed' and 'completed' -> 'seated' are the staff-facing
// "Undo" actions -- deliberately one step back only, not a general reopen
// (cancelled/no_show/completed -> confirmed stay unreachable here).
const ADMIN_BOOKING_TRANSITIONS = {
  confirmed: ['seated', 'no_show', 'cancelled'],
  seated: ['completed', 'confirmed'],
  completed: ['seated']
};

app.patch(
  '/api/v1/admin/bookings/:bookingReference/status',
  requireApprovedAdmin,
  async (req, res) => {
    const { bookingReference } = req.params;
    const { status: nextStatus, reason } = req.body;

    const validTargets = ['confirmed', 'seated', 'completed', 'no_show', 'cancelled'];

    if (!validTargets.includes(nextStatus)) {
      return res.status(400).json({
        status: 'failed',
        message: 'Invalid target status'
      });
    }

    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const bookingResult = await client.query(
        `
        SELECT
          b.id,
          b.booking_reference,
          b.booking_slot_id,
          b.party_size,
          b.status,
          b.customer_name,
          b.customer_email,
          b.customer_phone
        FROM bookings b
        WHERE b.booking_reference = $1
        FOR UPDATE OF b
        `,
        [bookingReference.trim()]
      );

      if (bookingResult.rowCount === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          status: 'failed',
          message: 'Booking not found'
        });
      }

      const booking = bookingResult.rows[0];
      const allowedNext = ADMIN_BOOKING_TRANSITIONS[booking.status] || [];

      if (!allowedNext.includes(nextStatus)) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          status: 'failed',
          message: `Booking cannot move from ${booking.status} to ${nextStatus}`
        });
      }

      if (nextStatus === 'no_show') {
        const slotResult = await client.query(
          `SELECT starts_at FROM booking_slots WHERE id = $1`,
          [booking.booking_slot_id]
        );

        const eligibleAt = new Date(
          new Date(slotResult.rows[0].starts_at).getTime() + 30 * 60 * 1000
        );

        if (new Date() < eligibleAt) {
          await client.query('ROLLBACK');

          return res.status(409).json({
            status: 'failed',
            message: `This booking can only be marked no-show from ${eligibleAt.toISOString()}`
          });
        }
      }

      if (nextStatus === 'cancelled' || nextStatus === 'no_show') {
        await client.query(
          `
          UPDATE booking_slots
          SET
            reserved_capacity = GREATEST(reserved_capacity - $1, 0),
            version_number = version_number + 1,
            updated_at = NOW()
          WHERE id = $2
          `,
          [booking.party_size, booking.booking_slot_id]
        );

        await client.query(
          `DELETE FROM booking_table_allocations WHERE booking_id = $1`,
          [booking.id]
        );
      }

      if (nextStatus === 'seated' && booking.status === 'completed') {
        // Undo Completed: the party is seated again, so seated_at (when they
        // were first seated) is preserved -- only completed_at clears.
        await client.query(
          `UPDATE bookings SET status = 'seated', completed_at = NULL, updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'seated') {
        await client.query(
          `UPDATE bookings SET status = 'seated', seated_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'confirmed') {
        // Undo Seated: the reservation itself never stopped existing, so
        // this just clears seated_at rather than touching booking_slots.
        await client.query(
          `UPDATE bookings SET status = 'confirmed', seated_at = NULL, updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'completed') {
        await client.query(
          `UPDATE bookings SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'no_show') {
        await client.query(
          `UPDATE bookings SET status = 'no_show', no_show_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [booking.id]
        );
      } else if (nextStatus === 'cancelled') {
        await client.query(
          `
          UPDATE bookings
          SET
            status = 'cancelled',
            cancelled_at = NOW(),
            cancelled_by_user_id = $2,
            cancel_reason = $3,
            updated_at = NOW()
          WHERE id = $1
          `,
          [booking.id, req.adminUser.id, typeof reason === 'string' && reason.trim() ? reason.trim() : null]
        );
      }

      await client.query('COMMIT');

      if (nextStatus === 'cancelled') {
        await notifications.notifyBookingCancelled(booking);
      }

      return res.status(200).json({
        status: 'ok',
        message: `Booking updated to ${nextStatus}`,
        bookingReference: booking.booking_reference
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Admin booking status update error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not update booking status'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

app.get('/api/v1/menu', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        md.file_name,
        md.storage_path,
        md.mime_type,
        md.file_size_bytes,
        md.created_at
      FROM menu_documents md
      JOIN venues v
        ON v.id = md.venue_id
      WHERE v.venue_reference = 'BAR185-MARRICKVILLE'
        AND md.is_active = TRUE
      LIMIT 1
    `);

    if (result.rowCount === 0) {
      return res.status(200).json({ menu: null });
    }

    const doc = result.rows[0];

    return res.status(200).json({
      menu: {
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        fileSizeBytes: Number(doc.file_size_bytes),
        publishedAt: doc.created_at,
        url: `${PUBLIC_PREFIX}/${doc.storage_path}`
      }
    });
  } catch (error) {
    console.error('Get public menu error:', error.message);

    return res.status(500).json({
      status: 'failed',
      message: 'Could not load menu'
    });
  }
});

app.get(
  '/api/v1/admin/menu',
  requireApprovedAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          md.id,
          md.file_name,
          md.storage_path,
          md.mime_type,
          md.file_size_bytes,
          md.is_active,
          md.created_at,
          u.display_name AS uploaded_by_name
        FROM menu_documents md
        JOIN venues v
          ON v.id = md.venue_id
        LEFT JOIN users u
          ON u.id = md.uploaded_by_user_id
        WHERE v.venue_reference = 'BAR185-MARRICKVILLE'
        ORDER BY md.created_at DESC
      `);

      return res.status(200).json({
        status: 'ok',
        documents: result.rows.map((row) => ({
          ...row,
          file_size_bytes: Number(row.file_size_bytes),
          url: `${PUBLIC_PREFIX}/${row.storage_path}`
        }))
      });
    } catch (error) {
      console.error('Admin menu list error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not load menu documents'
      });
    }
  }
);

app.post(
  '/api/v1/admin/menu',
  requireApprovedAdmin,
  menuUpload.single('menuFile'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        status: 'failed',
        message: 'A menu file (PDF, JPG, or PNG) is required'
      });
    }

    let client;

    try {
      const { storagePath } = saveMenuFile(req.file.buffer, req.file.mimetype);

      client = await pool.connect();
      await client.query('BEGIN');

      const venueResult = await client.query(
        `SELECT id FROM venues WHERE venue_reference = 'BAR185-MARRICKVILLE'`
      );

      const venueId = venueResult.rows[0].id;

      await client.query(
        `
        UPDATE menu_documents
        SET is_active = FALSE, updated_at = NOW()
        WHERE venue_id = $1 AND is_active = TRUE
        `,
        [venueId]
      );

      const insertResult = await client.query(
        `
        INSERT INTO menu_documents (
          venue_id, file_name, storage_path, mime_type, file_size_bytes, uploaded_by_user_id, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        RETURNING id, file_name, storage_path, mime_type, file_size_bytes, created_at
        `,
        [
          venueId,
          req.file.originalname,
          storagePath,
          req.file.mimetype,
          req.file.size,
          req.adminUser.id
        ]
      );

      await client.query('COMMIT');

      const document = insertResult.rows[0];

      return res.status(201).json({
        status: 'ok',
        message: 'Menu published',
        document: {
          ...document,
          file_size_bytes: Number(document.file_size_bytes),
          url: `${PUBLIC_PREFIX}/${storagePath}`
        }
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }

      console.error('Menu upload error:', error.message);

      return res.status(500).json({
        status: 'failed',
        message: 'Could not publish menu'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// Multer's fileFilter/size-limit errors reach us via Express's error-handling
// middleware (four-argument signature), not the normal request pipeline --
// without this, they'd fall through to Express's default HTML error page
// instead of the JSON responses the rest of this API returns.
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || /file/i.test(error.message || '')) {
    return res.status(400).json({
      status: 'failed',
      message: error.message
    });
  }

  console.error('Unhandled error:', error.message);

  return res.status(500).json({
    status: 'failed',
    message: 'Unexpected server error'
  });
});

app.listen(PORT, () => {
  console.log(`Bar 185 API running on http://localhost:${PORT}`);
});
