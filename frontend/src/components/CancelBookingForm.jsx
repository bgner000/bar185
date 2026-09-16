import { useState } from 'react'
import api from '../lib/api'
import { Alert } from './Feedback'

function CancelBookingForm() {
  const [bookingReference, setBookingReference] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | success | error
  const [message, setMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('submitting')
    setMessage('')

    try {
      const data = await api.cancelBooking(bookingReference.trim(), customerEmail.trim())
      setStatus('success')
      setMessage(data.message)
    } catch (error) {
      setStatus('error')
      setMessage(error.message)
    }
  }

  return (
    <form className="card manage-booking" onSubmit={handleSubmit}>
      <h3>Manage an existing booking</h3>
      <p>Cancel a confirmed table booking using your reference and email.</p>

      {status === 'success' && (
        <Alert type="success" title="Booking updated">
          {message}
        </Alert>
      )}

      {status === 'error' && (
        <Alert type="error" title="Could not cancel booking">
          {message}
        </Alert>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor="cancel-ref">Booking reference</label>
          <input
            id="cancel-ref"
            value={bookingReference}
            onChange={(event) => setBookingReference(event.target.value)}
            placeholder="B185-XXXXXXXXXX"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="cancel-email">Email used for booking</label>
          <input
            id="cancel-email"
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            required
          />
        </div>
      </div>

      <button type="submit" className="btn btn-danger-outline" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Cancelling…' : 'Cancel Booking'}
      </button>
    </form>
  )
}

export default CancelBookingForm
