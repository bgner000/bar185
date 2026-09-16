import { useState } from 'react'
import api from '../lib/api'
import { Alert } from './Feedback'

const EMPTY_FORM = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  eventType: '',
  preferredStartAt: '',
  preferredEndAt: '',
  expectedGuestCount: '',
  message: '',
}

function EventEnquiryForm() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [status, setStatus] = useState('idle') // idle | submitting | success | error
  const [feedback, setFeedback] = useState(null)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('submitting')
    setFeedback(null)

    try {
      const data = await api.createEventEnquiry({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        eventType: form.eventType,
        preferredStartAt: form.preferredStartAt
          ? new Date(form.preferredStartAt).toISOString()
          : null,
        preferredEndAt: form.preferredEndAt
          ? new Date(form.preferredEndAt).toISOString()
          : null,
        expectedGuestCount: form.expectedGuestCount ? Number(form.expectedGuestCount) : null,
        message: form.message,
      })

      setStatus('success')
      setFeedback({ reference: data.enquiry.enquiry_reference })
      setForm(EMPTY_FORM)
    } catch (error) {
      setStatus('error')
      setFeedback({ message: error.message })
    }
  }

  if (status === 'success' && feedback) {
    return (
      <div className="card card-raised">
        <Alert type="success" title="Enquiry submitted">
          Thanks — your reference is <strong>{feedback.reference}</strong>. Our events team
          will review it and be in touch.
        </Alert>
        <button type="button" className="btn btn-secondary" onClick={() => setStatus('idle')}>
          Submit another enquiry
        </button>
      </div>
    )
  }

  return (
    <form className="card card-raised" onSubmit={handleSubmit}>
      {status === 'error' && feedback && (
        <Alert type="error" title="Could not submit enquiry">
          {feedback.message}
        </Alert>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor="eq-name">Full name</label>
          <input
            id="eq-name"
            name="customerName"
            value={form.customerName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="eq-email">Email</label>
          <input
            id="eq-email"
            name="customerEmail"
            type="email"
            value={form.customerEmail}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="eq-phone">Phone</label>
          <input
            id="eq-phone"
            name="customerPhone"
            value={form.customerPhone}
            onChange={handleChange}
          />
        </div>

        <div className="field">
          <label htmlFor="eq-type">Event type</label>
          <input
            id="eq-type"
            name="eventType"
            placeholder="Birthday, engagement, corporate…"
            value={form.eventType}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="eq-start">Preferred start</label>
          <input
            id="eq-start"
            name="preferredStartAt"
            type="datetime-local"
            value={form.preferredStartAt}
            onChange={handleChange}
          />
        </div>

        <div className="field">
          <label htmlFor="eq-end">Preferred end</label>
          <input
            id="eq-end"
            name="preferredEndAt"
            type="datetime-local"
            value={form.preferredEndAt}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="eq-guests">Expected guests</label>
        <input
          id="eq-guests"
          name="expectedGuestCount"
          type="number"
          min="1"
          value={form.expectedGuestCount}
          onChange={handleChange}
        />
      </div>

      <div className="field">
        <label htmlFor="eq-message">Tell us about your event</label>
        <textarea
          id="eq-message"
          name="message"
          value={form.message}
          onChange={handleChange}
          required
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Submitting…' : 'Submit Event Enquiry'}
      </button>
    </form>
  )
}

export default EventEnquiryForm
