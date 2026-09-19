import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../lib/api'
import { sydneyDateKey, todaySydneyDateKey, formatDate, formatTime, formatCurrency } from '../lib/format'
import { Alert, LoadingState, EmptyState } from './Feedback'
import BookingCalendar from './BookingCalendar'
import TimePicker from './TimePicker'
import BookingSecurityChoice from './BookingSecurityChoice'
import { isLikelyAuMobile } from '../lib/validation'

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
  const [status, setStatus] = useState('idle') // idle | submitting | confirming-deposit | confirmed | pending | error
  const [result, setResult] = useState(null)
  const [securityMethod, setSecurityMethod] = useState('email') // 'email' | 'deposit'
  const [verification, setVerification] = useState(null) // { channel, verificationId, rawValue } | null

  // The single source of truth for "is there a verification proof that
  // still matches what's in the form right now" -- computed fresh every
  // render from the actual field values, not stored as a flag that could
  // go stale. The backend re-checks this same thing independently; this
  // only gates the UI.
  const isEmailVerificationCurrent = Boolean(
    verification && verification.channel === 'email' && verification.rawValue === form.customerEmail.trim()
  )

  // Payment itself happens at Stripe, after this form submits -- there's
  // no "paid" proof to check client-side before that. A valid-looking
  // phone number is as far as this button can gate; the backend revalidates
  // everything (slot, capacity, party size) before it will even start a
  // Checkout Session.
  const isDepositPhoneValid = isLikelyAuMobile(form.customerPhone)

  const isBookingSecured = securityMethod === 'deposit' ? isDepositPhoneValid : isEmailVerificationCurrent

  const largeGroupIdempotencyKey = useRef(null)
  const todayKey = todaySydneyDateKey()

  // Picks up where the customer left off after Stripe Checkout redirects
  // back here. Deliberately does NOT trust checkout_session_id being
  // present as proof of anything -- it just tells us which booking to ask
  // the backend about. The backend's webhook is what actually confirmed
  // (or didn't) the booking; this only polls for that outcome so the
  // customer isn't left on a blank success_url page while it lands. A
  // real effect (synchronizing with an external async process), not
  // state derived from props.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutSessionId = params.get('checkout_session_id')
    const depositCancelled = params.get('depositCancelled')

    if (!checkoutSessionId && !depositCancelled) return undefined

    let cancelled = false
    let attempts = 0

    // setState calls are kept out of the effect body itself (nested in
    // these functions instead) -- calling it directly in an effect body
    // triggers cascading renders; see the same fix already applied in
    // BookingSecurityChoice's cooldown timer and elsewhere in this app.
    const finish = (nextStatus, nextResult) => {
      if (cancelled) return
      window.history.replaceState({}, '', window.location.pathname)
      setStatus(nextStatus)
      setResult(nextResult)
    }

    const poll = async () => {
      if (cancelled) return

      attempts += 1

      try {
        const data = await api.getDepositStatus(checkoutSessionId)

        if (data.bookingStatus === 'confirmed') {
          finish('confirmed', {
            reference: data.bookingReference,
            hasPhone: true,
            depositPaid: true,
            depositAmountCents: data.depositAmountCents,
            partySize: data.partySize,
            startsAt: data.startsAt,
            endsAt: data.endsAt,
          })
          return
        }

        if (data.bookingStatus === 'cancelled') {
          finish('error', {
            message: 'Your payment could not be confirmed, so this booking was not completed. Please try again.',
          })
          return
        }

        if (attempts >= 10) {
          finish('error', {
            message:
              "We're still confirming your payment. If you don't receive a confirmation email shortly, please contact us with your booking reference.",
          })
          return
        }

        setTimeout(poll, 2000)
      } catch {
        if (attempts >= 3) {
          finish('error', { message: 'Could not check your payment status. Please contact us if you were charged.' })
          return
        }

        setTimeout(poll, 2000)
      }
    }

    const start = () => {
      if (depositCancelled) {
        finish('error', {
          message: 'Deposit payment was cancelled. Your booking was not completed — you can try again below.',
        })
        return
      }

      setStatus('confirming-deposit')
      poll()
    }

    start()

    return () => {
      cancelled = true
    }
  }, [])

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
    setSecurityMethod('email')
    setVerification(null)
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

    // The button is already disabled without this, but the backend is the
    // real boundary -- this is just so a submit that somehow fires anyway
    // (e.g. pressing Enter) gets the same clear message instead of a
    // generic error from the API.
    if (!isBookingSecured) {
      setStatus('error')
      setResult({
        message:
          securityMethod === 'deposit'
            ? 'Please enter a valid phone number for the deposit option.'
            : 'Please verify your email before booking.',
      })
      return
    }

    if (securityMethod === 'deposit') {
      try {
        const data = await api.startDepositBooking({
          bookingSlotId: Number(form.bookingSlotId),
          partySize: Number(form.partySize),
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          specialRequests: form.specialRequests,
        })

        // Leaving the page on purpose -- the booking is only a capacity
        // hold right now, not confirmed. Form state is left as-is (not
        // cleared) in case the customer comes straight back via the
        // browser's back button before paying.
        window.location.href = data.checkoutUrl
      } catch (error) {
        if (error.status === 422 && error.body?.status === 'large_group_required') {
          setStatus('error')
          setResult({
            message:
              'Parties this size need to submit a large-group request instead of a deposit booking. Please get in touch with us directly, or reduce your party size.',
          })
          return
        }

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

      return
    }

    try {
      const data = await api.createBooking({
        ...form,
        partySize: Number(form.partySize),
        bookingSlotId: Number(form.bookingSlotId),
        bookingSecurityMethod: 'email_verification',
        verificationId: verification.verificationId,
      })

      setStatus('confirmed')
      setResult({ reference: data.booking.booking_reference, hasPhone: Boolean(form.customerPhone.trim()) })
      setForm(EMPTY_FORM)
      setSelectedDate(null)
      setSecurityMethod('email')
      setVerification(null)
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

        // Large-group requests are staff-reviewed, not paid up front, so
        // the deposit option doesn't apply to them -- they still need the
        // same email verification proof standard bookings used to require
        // from either channel.
        if (securityMethod !== 'email' || !isEmailVerificationCurrent) {
          setStatus('error')
          setResult({
            message:
              'Parties this size need to submit a large-group request, which requires email verification. Please choose email verification and try again.',
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
              verificationId: verification.verificationId,
            },
            idempotencyKey
          )

          setStatus('pending')
          setResult({ reference: largeGroupData.request.request_reference })
          largeGroupIdempotencyKey.current = null
          setForm(EMPTY_FORM)
          setSelectedDate(null)
          setSecurityMethod('email')
          setVerification(null)
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

  if (status === 'confirming-deposit') {
    return (
      <div className="card card-raised booking-result">
        <LoadingState label="Confirming your payment…" />
        <p>This only takes a moment. Please don't close this page.</p>
      </div>
    )
  }

  if (status === 'confirmed' && result) {
    return (
      <div className="card card-raised booking-result">
        <Alert type="success" title="Booking confirmed">
          Booking confirmed. Reference: <strong>{result.reference}</strong>.
        </Alert>

        {result.depositPaid && (
          <dl className="booking-result-details">
            <div>
              <span>Date</span>
              <span>{formatDate(result.startsAt)}</span>
            </div>
            <div>
              <span>Time</span>
              <span>
                {formatTime(result.startsAt)} – {formatTime(result.endsAt)}
              </span>
            </div>
            <div>
              <span>Party size</span>
              <span>{result.partySize} guests</span>
            </div>
            <div>
              <span>Deposit paid</span>
              <span>{formatCurrency((result.depositAmountCents || 1000) / 100)}</span>
            </div>
          </dl>
        )}

        <p>
          Confirmation will be sent to your email{result.hasPhone ? ' and mobile' : ''}. Keep your
          reference handy if you need to cancel.
          {result.depositPaid &&
            ' Your deposit is credited toward your bill when you attend — cancel at least 12 hours ahead for a full refund.'}
        </p>
        <button type="button" className="btn btn-secondary" onClick={resetBooking}>
          Make another booking
        </button>
      </div>
    )
  }

  if (status === 'pending' && result) {
    return (
      <div className="card card-raised booking-result">
        <Alert type="info" title="Request received">
          Request received and pending staff review. Reference: <strong>{result.reference}</strong>.
        </Alert>
        <p>
          A confirmation of receipt will be sent to your email and mobile. Our team will review
          availability and follow up by email — this is not yet a confirmed booking.
        </p>
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
          <TimePicker
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

      <BookingSecurityChoice
        email={form.customerEmail}
        phone={form.customerPhone}
        method={securityMethod}
        onMethodChange={setSecurityMethod}
        verification={isEmailVerificationCurrent ? verification : null}
        onVerified={setVerification}
      />

      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={status === 'submitting' || !form.bookingSlotId || !isBookingSecured}
      >
        {status === 'submitting'
          ? securityMethod === 'deposit'
            ? 'Redirecting to payment…'
            : 'Submitting…'
          : securityMethod === 'deposit'
            ? 'Continue to Payment'
            : 'Confirm Booking'}
      </button>
    </form>
  )
}

export default BookingForm
