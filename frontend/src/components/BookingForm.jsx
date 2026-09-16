import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../lib/api'
import { sydneyDateKey, todaySydneyDateKey } from '../lib/format'
import { Alert, LoadingState, EmptyState } from './Feedback'
import BookingCalendar from './BookingCalendar'
import TimeSlotPicker from './TimeSlotPicker'

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

  const [selectedDate, setSelectedDate] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [status, setStatus] = useState('idle') // idle | submitting | confirmed | pending | error
  const [result, setResult] = useState(null)

  const largeGroupIdempotencyKey = useRef(null)
  const todayKey = todaySydneyDateKey()

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

  // Group the backend's actual booking-slot records by their Sydney-local
  // calendar date, so availability shown here always traces back to real data.
  const availability = useMemo(() => {
    const map = new Map()

    for (const slot of slots) {
      const key = sydneyDateKey(slot.starts_at)
      const seats = slot.total_capacity - slot.reserved_capacity

      if (!map.has(key)) {
        map.set(key, { slots: [], hasAvailability: false })
      }

      const entry = map.get(key)
      entry.slots.push(slot)
      if (seats > 0) entry.hasAvailability = true
    }

    for (const entry of map.values()) {
      entry.slots.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    }

    return map
  }, [slots])

  // Default to the earliest date with real availability until the visitor
  // explicitly picks one — computed during render rather than in an effect,
  // since it's a derived value, not a synchronization with an external system.
  const firstAvailableDate = useMemo(
    () => [...availability.keys()].sort().find((key) => availability.get(key).hasAvailability) ?? null,
    [availability]
  )
  const effectiveSelectedDate = selectedDate ?? firstAvailableDate

  const selectDate = (dateKey) => {
    setSelectedDate(dateKey)
    setForm((current) => ({ ...current, bookingSlotId: '' }))
    largeGroupIdempotencyKey.current = null
  }

  const selectSlot = (slotId) => {
    largeGroupIdempotencyKey.current = null
    setForm((current) => ({ ...current, bookingSlotId: String(slotId) }))
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    largeGroupIdempotencyKey.current = null

    setForm((current) => ({ ...current, [name]: value }))
  }

  const resetBooking = () => {
    setStatus('idle')
    setResult(null)
    setForm(EMPTY_FORM)
    setSelectedDate(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('submitting')
    setResult(null)

    const selectedSlot = slots.find((slot) => Number(slot.id) === Number(form.bookingSlotId))

    if (!selectedSlot) {
      setStatus('error')
      setResult({ message: 'Please select a date and time for your booking.' })
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
      setSelectedDate(null)
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
          const idempotencyKey =
            largeGroupIdempotencyKey.current ??
            `lg-${Date.now()}-${Math.random().toString(36).slice(2)}`

          largeGroupIdempotencyKey.current = idempotencyKey

          const largeGroupData = await api.createLargeGroupBookingRequest(
            {
              bookingDate: effectiveSelectedDate,
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
          setSelectedDate(null)
        } catch (largeGroupError) {
          setStatus('error')
          setResult({ message: largeGroupError.message })
        }

        return
      }

      // A 404/409 here means the slot the visitor picked is no longer what
      // they saw (someone else booked it, staff closed it, etc.). Refresh
      // real availability from the backend rather than leaving stale chips
      // on screen, and make them pick a time again.
      const isStaleAvailability = error.status === 404 || error.status === 409

      setStatus('error')
      setResult({
        message: isStaleAvailability
          ? `${error.message} Availability has been refreshed below — please choose a time again.`
          : error.message,
      })

      if (isStaleAvailability) {
        setForm((current) => ({ ...current, bookingSlotId: '' }))
        reloadSlots()
      }
    }
  }

  const dateSlots = effectiveSelectedDate ? availability.get(effectiveSelectedDate)?.slots ?? [] : []
  const hasAnyAvailability = [...availability.values()].some((entry) => entry.hasAvailability)

  if (status === 'confirmed' && result) {
    return (
      <div className="card card-raised booking-result">
        <Alert type="success" title="Booking confirmed">
          Your table is booked. Reference: <strong>{result.reference}</strong>
        </Alert>
        <p>A confirmation has been recorded against this reference. Keep it handy if you need to cancel.</p>
        <button type="button" className="btn btn-secondary" onClick={resetBooking}>
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
        <button type="button" className="btn btn-secondary" onClick={resetBooking}>
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
        <label>Choose a date</label>

        {slotsLoading ? (
          <LoadingState label="Loading availability…" />
        ) : hasAnyAvailability ? (
          <BookingCalendar
            availability={availability}
            selectedDate={effectiveSelectedDate}
            onSelectDate={selectDate}
            todayKey={todayKey}
          />
        ) : (
          !slotsError && <EmptyState label="No upcoming booking times are open right now." />
        )}
      </div>

      {hasAnyAvailability && !slotsLoading && (
        <div className="field">
          <label>Choose a time</label>
          <TimeSlotPicker
            dateKey={effectiveSelectedDate}
            slots={dateSlots}
            selectedSlotId={form.bookingSlotId}
            onSelectSlot={selectSlot}
          />
        </div>
      )}

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
          {Number(form.partySize) >= 9 && (
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

      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={status === 'submitting' || !form.bookingSlotId}
      >
        {status === 'submitting' ? 'Submitting…' : 'Confirm Booking'}
      </button>
    </form>
  )
}

export default BookingForm
