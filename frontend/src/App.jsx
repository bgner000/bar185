import { useEffect, useRef, useState } from 'react'
import './App.css'

function App() {
  const [apiStatus, setApiStatus] = useState('Checking backend...')
  const [slots, setSlots] = useState([])
  const [message, setMessage] = useState('')
  const [eventMessage, setEventMessage] = useState('')

  const largeGroupIdempotencyKey = useRef(null)

  const [form, setForm] = useState({
    bookingSlotId: '',
    partySize: 2,
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    specialRequests: '',
  })

  const [eventForm, setEventForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    eventType: '',
    preferredStartAt: '',
    preferredEndAt: '',
    expectedGuestCount: '',
    message: '',
  })

  const loadSlots = () => {
    fetch('http://localhost:3000/api/v1/booking-slots')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Could not load booking slots')
        }

        return response.json()
      })
      .then((data) => {
        setSlots(data.slots)
      })
      .catch(() => {
        setMessage('Could not load booking slots')
      })
  }

  useEffect(() => {
    fetch('http://localhost:3000/api/v1/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Backend unavailable')
        }

        return response.json()
      })
      .then((data) => {
        setApiStatus(`${data.service} — ${data.status}`)
      })
      .catch(() => {
        setApiStatus('Backend connection failed')
      })

    loadSlots()
  }, [])

  const formatDateTime = (dateTime) => {
    return new Date(dateTime).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  const handleChange = (event) => {
    const { name, value } = event.target

    largeGroupIdempotencyKey.current = null

    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleEventChange = (event) => {
    const { name, value } = event.target

    setEventForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('Submitting...')

    const selectedSlot = slots.find(
      (slot) => Number(slot.id) === Number(form.bookingSlotId)
    )

    if (!selectedSlot) {
      setMessage('Please select a booking slot')
      return
    }

    try {
      const response = await fetch(
        'http://localhost:3000/api/v1/bookings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...form,
            partySize: Number(form.partySize),
            bookingSlotId: Number(form.bookingSlotId),
          }),
        }
      )

      const data = await response.json()

      if (
        response.status === 422 &&
        data.status === 'large_group_required'
      ) {
        if (!form.customerPhone.trim()) {
          setMessage(
            'Phone number is required for a large-group booking request'
          )
          return
        }

        const slotDate = new Date(selectedSlot.starts_at)

        const dateParts = new Intl.DateTimeFormat('en-AU', {
          timeZone: 'Australia/Sydney',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(slotDate)

        const dateValues = Object.fromEntries(
          dateParts.map(({ type, value }) => [type, value])
        )

        const bookingDate =
          `${dateValues.year}-${dateValues.month}-${dateValues.day}`

        const idempotencyKey =
          largeGroupIdempotencyKey.current ??
          `lg-${Date.now()}-${Math.random().toString(36).slice(2)}`

        largeGroupIdempotencyKey.current = idempotencyKey

        const largeGroupResponse = await fetch(
          'http://localhost:3000/api/v1/large-group-booking-requests',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({
              bookingDate,
              slotStartAt: selectedSlot.starts_at,
              partySize: Number(form.partySize),
              customerName: form.customerName,
              customerPhone: form.customerPhone,
              customerEmail: form.customerEmail,
            }),
          }
        )

        const largeGroupData = await largeGroupResponse.json()

        if (!largeGroupResponse.ok) {
          throw new Error(
            largeGroupData.message ||
              'Large-group booking request failed'
          )
        }

        setMessage(
          `Large-group request submitted. Reference: ${largeGroupData.request.request_reference}. Pending staff review.`
        )

        largeGroupIdempotencyKey.current = null

        setForm({
          bookingSlotId: '',
          partySize: 2,
          customerName: '',
          customerEmail: '',
          customerPhone: '',
          specialRequests: '',
        })

        return
      }

      if (!response.ok) {
        throw new Error(data.message || 'Booking failed')
      }

      setMessage(
        `Booking confirmed. Reference: ${data.booking.booking_reference}`
      )

      setForm({
        bookingSlotId: '',
        partySize: 2,
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        specialRequests: '',
      })

      loadSlots()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handleEventSubmit = async (event) => {
    event.preventDefault()
    setEventMessage('Submitting event enquiry...')

    try {
      const response = await fetch(
        'http://localhost:3000/api/v1/event-enquiries',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerName: eventForm.customerName,
            customerEmail: eventForm.customerEmail,
            customerPhone: eventForm.customerPhone,
            eventType: eventForm.eventType,
            preferredStartAt: eventForm.preferredStartAt
              ? new Date(eventForm.preferredStartAt).toISOString()
              : null,
            preferredEndAt: eventForm.preferredEndAt
              ? new Date(eventForm.preferredEndAt).toISOString()
              : null,
            expectedGuestCount: eventForm.expectedGuestCount
              ? Number(eventForm.expectedGuestCount)
              : null,
            message: eventForm.message,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not submit event enquiry'
        )
      }

      setEventMessage(
        `Event enquiry submitted. Reference: ${data.enquiry.enquiry_reference}. Pending staff review.`
      )

      setEventForm({
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        eventType: '',
        preferredStartAt: '',
        preferredEndAt: '',
        expectedGuestCount: '',
        message: '',
      })
    } catch (error) {
      setEventMessage(error.message)
    }
  }

  return (
    <main>
      <h1>Bar 185</h1>

      <p>
        Backend: <strong>{apiStatus}</strong>
      </p>

      <h2>Book a Table</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="bookingSlotId">Booking slot</label>
          <br />

          <select
            id="bookingSlotId"
            name="bookingSlotId"
            value={form.bookingSlotId}
            onChange={handleChange}
            required
          >
            <option value="">Select a time</option>

            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {formatDateTime(slot.starts_at)} —{' '}
                {slot.total_capacity - slot.reserved_capacity} available
              </option>
            ))}
          </select>
        </div>

        <br />

        <div>
          <label htmlFor="partySize">Party size</label>
          <br />

          <input
            id="partySize"
            name="partySize"
            type="number"
            min="1"
            value={form.partySize}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="customerName">Name</label>
          <br />

          <input
            id="customerName"
            name="customerName"
            value={form.customerName}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="customerEmail">Email</label>
          <br />

          <input
            id="customerEmail"
            name="customerEmail"
            type="email"
            value={form.customerEmail}
            onChange={handleChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="customerPhone">Phone</label>
          <br />

          <input
            id="customerPhone"
            name="customerPhone"
            value={form.customerPhone}
            onChange={handleChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="specialRequests">
            Special requests
          </label>
          <br />

          <textarea
            id="specialRequests"
            name="specialRequests"
            value={form.specialRequests}
            onChange={handleChange}
          />
        </div>

        <br />

        <button type="submit">Confirm Booking</button>
      </form>

      {message && (
        <p>
          <strong>{message}</strong>
        </p>
      )}

      <hr />

      <h2>Available Booking Slots</h2>

      {slots.map((slot) => (
        <div key={slot.id}>
          <h3>{slot.venue_name}</h3>

          <p>
            <strong>Start:</strong>{' '}
            {formatDateTime(slot.starts_at)}
          </p>

          <p>
            <strong>End:</strong>{' '}
            {formatDateTime(slot.ends_at)}
          </p>

          <p>
            <strong>Available capacity:</strong>{' '}
            {slot.total_capacity - slot.reserved_capacity}
          </p>

          <hr />
        </div>
      ))}

      <h2>Event Enquiry</h2>

      <p>
        Planning a private event or celebration? Send us an enquiry
        and our team will review it.
      </p>

      <form onSubmit={handleEventSubmit}>
        <div>
          <label htmlFor="eventCustomerName">Name</label>
          <br />

          <input
            id="eventCustomerName"
            name="customerName"
            value={eventForm.customerName}
            onChange={handleEventChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="eventCustomerEmail">Email</label>
          <br />

          <input
            id="eventCustomerEmail"
            name="customerEmail"
            type="email"
            value={eventForm.customerEmail}
            onChange={handleEventChange}
            required
          />
        </div>

        <br />

        <div>
          <label htmlFor="eventCustomerPhone">Phone</label>
          <br />

          <input
            id="eventCustomerPhone"
            name="customerPhone"
            value={eventForm.customerPhone}
            onChange={handleEventChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="eventType">Event type</label>
          <br />

          <input
            id="eventType"
            name="eventType"
            placeholder="Birthday, engagement, corporate event..."
            value={eventForm.eventType}
            onChange={handleEventChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="preferredStartAt">
            Preferred start
          </label>
          <br />

          <input
            id="preferredStartAt"
            name="preferredStartAt"
            type="datetime-local"
            value={eventForm.preferredStartAt}
            onChange={handleEventChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="preferredEndAt">
            Preferred end
          </label>
          <br />

          <input
            id="preferredEndAt"
            name="preferredEndAt"
            type="datetime-local"
            value={eventForm.preferredEndAt}
            onChange={handleEventChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="expectedGuestCount">
            Expected guests
          </label>
          <br />

          <input
            id="expectedGuestCount"
            name="expectedGuestCount"
            type="number"
            min="1"
            value={eventForm.expectedGuestCount}
            onChange={handleEventChange}
          />
        </div>

        <br />

        <div>
          <label htmlFor="eventMessage">
            Tell us about your event
          </label>
          <br />

          <textarea
            id="eventMessage"
            name="message"
            value={eventForm.message}
            onChange={handleEventChange}
            required
          />
        </div>

        <br />

        <button type="submit">
          Submit Event Enquiry
        </button>
      </form>

      {eventMessage && (
        <p>
          <strong>{eventMessage}</strong>
        </p>
      )}
    </main>
  )
}

export default App