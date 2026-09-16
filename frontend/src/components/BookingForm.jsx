import { useEffect, useRef, useState } from 'react'
import api from '../lib/api'
import { formatDateTime } from '../lib/format'
import { Alert, LoadingState } from './Feedback'

const EMPTY_FORM = {
  bookingSlotId: '',
  partySize: 2,
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  specialRequests: '',
}

function BookingForm() {
  const [slots, setSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(true)
  const [slotsError, setSlotsError] = useState('')

  const [form, setForm] = useState(EMPTY_FORM)
  const [status, setStatus] = useState('idle') // idle | submitting | confirmed | pending | error
  const [result, setResult] = useState(null)

  const largeGroupIdempotencyKey = useRef(null)

  const applySlotsResponse = (promise) =>
    promise
      .then((data) => setSlots(data.slots))
      .catch(() => setSlotsError('Could not load booking slots. Please refresh and try again.'))
      .finally(() => setSlotsLoading(false))

  const reloadSlots = () => {
    setSlotsLoading(true)
    setSlotsError('')
    applySlotsResponse(api.getBookingSlots())
  }

  useEffect(() => {
    applySlotsResponse(api.getBookingSlots())
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target
    largeGroupIdempotencyKey.current = null

    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('submitting')
    setResult(null)

    const selectedSlot = slots.find((slot) => Number(slot.id) === Number(form.bookingSlotId))

    if (!selectedSlot) {
      setStatus('error')
      setResult({ message: 'Please select a booking time.' })
      return
    }

    try {
      const data = await api.createBooking({
        ...form,
        partySize: Number(form.partySize),
        bookingSlotId: Number(form.bookingSlotId),
      })

      setStatus('confirmed')
      setResult({ reference: data.booking.booking_reference })
      setForm(EMPTY_FORM)
      reloadSlots()
    } catch (error) {
      if (error.status === 422 && error.body?.status === 'large_group_required') {
        if (!form.customerPhone.trim()) {
          setStatus('error')
          setResult({
            message: 'A phone number is required for a large-group booking request.',
          })
          return
        }

        try {
          const slotDate = new Date(selectedSlot.starts_at)

          const dateParts = new Intl.DateTimeFormat('en-AU', {
            timeZone: 'Australia/Sydney',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).formatToParts(slotDate)

          const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
          const bookingDate = `${dateValues.year}-${dateValues.month}-${dateValues.day}`

          const idempotencyKey =
            largeGroupIdempotencyKey.current ??
            `lg-${Date.now()}-${Math.random().toString(36).slice(2)}`

          largeGroupIdempotencyKey.current = idempotencyKey

          const largeGroupData = await api.createLargeGroupBookingRequest(
            {
              bookingDate,
              slotStartAt: selectedSlot.starts_at,
              partySize: Number(form.partySize),
              customerName: form.customerName,
              customerPhone: form.customerPhone,
              customerEmail: form.customerEmail,
            },
            idempotencyKey
          )

          setStatus('pending')
          setResult({ reference: largeGroupData.request.request_reference })
          largeGroupIdempotencyKey.current = null
          setForm(EMPTY_FORM)
        } catch (largeGroupError) {
          setStatus('error')
          setResult({ message: largeGroupError.message })
        }

        return
      }

      setStatus('error')
      setResult({ message: error.message })
    }
  }

  const selectedSlot = slots.find((slot) => Number(slot.id) === Number(form.bookingSlotId))
  const availableForSelected = selectedSlot
    ? selectedSlot.total_capacity - selectedSlot.reserved_capacity
    : null

  if (status === 'confirmed' && result) {
    return (
      <div className="card card-raised booking-result">
        <Alert type="success" title="Booking confirmed">
          Your table is booked. Reference: <strong>{result.reference}</strong>
        </Alert>
        <p>A confirmation has been recorded against this reference. Keep it handy if you need to cancel.</p>
        <button type="button" className="btn btn-secondary" onClick={() => setStatus('idle')}>
          Make another booking
        </button>
      </div>
    )
  }

  if (status === 'pending' && result) {
    return (
      <div className="card card-raised booking-result">
        <Alert type="info" title="Large-group request submitted">
          This party size needs staff review before it's confirmed. Reference:{' '}
          <strong>{result.reference}</strong>
        </Alert>
        <p>Our team will review availability and confirm by email. This is not yet a confirmed booking.</p>
        <button type="button" className="btn btn-secondary" onClick={() => setStatus('idle')}>
          Make another booking
        </button>
      </div>
    )
  }

  return (
    <form className="card card-raised" onSubmit={handleSubmit}>
      {status === 'error' && result && (
        <Alert type="error" title="Booking failed">
          {result.message}
        </Alert>
      )}

      {slotsError && <Alert type="error">{slotsError}</Alert>}

      <div className="field">
        <label htmlFor="bookingSlotId">Booking time</label>

        {slotsLoading ? (
          <LoadingState label="Loading available times…" />
        ) : (
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
                {formatDateTime(slot.starts_at)} — {slot.total_capacity - slot.reserved_capacity}{' '}
                seats available
              </option>
            ))}
          </select>
        )}

        {!slotsLoading && slots.length === 0 && !slotsError && (
          <span className="field-hint">No upcoming booking times are open right now.</span>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="partySize">Party size</label>
          <input
            id="partySize"
            name="partySize"
            type="number"
            min="1"
            value={form.partySize}
            onChange={handleChange}
            required
          />
          {availableForSelected !== null && Number(form.partySize) >= 9 && (
            <span className="field-hint">
              Parties of 9+ are routed to our team for large-group review.
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="customerPhone">Phone</label>
          <input
            id="customerPhone"
            name="customerPhone"
            value={form.customerPhone}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="customerName">Name</label>
          <input
            id="customerName"
            name="customerName"
            value={form.customerName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="customerEmail">Email</label>
          <input
            id="customerEmail"
            name="customerEmail"
            type="email"
            value={form.customerEmail}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="specialRequests">Special requests</label>
        <textarea
          id="specialRequests"
          name="specialRequests"
          value={form.specialRequests}
          onChange={handleChange}
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Submitting…' : 'Confirm Booking'}
      </button>
    </form>
  )
}

export default BookingForm
