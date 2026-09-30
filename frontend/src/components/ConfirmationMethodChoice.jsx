import { isLikelyAuMobile } from '../lib/validation'

const OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
]

// "How would you like to receive your confirmation?" -- native radio
// inputs inside a fieldset/legend, so arrow keys, Space, labels and screen
// reader announcements all work without custom ARIA. Nothing is
// preselected: the customer has to make an explicit choice (BookingForm
// validates this on submit and shows `error` here).
//
// Selected state is shown by the native radio dot, a heavier border and a
// "Selected" text marker -- not by colour alone.
function ConfirmationMethodChoice({ value, onChange, email, phone, error, errorId }) {
  const trimmedEmail = email.trim()
  const trimmedPhone = phone.trim()
  const phoneOk = isLikelyAuMobile(phone)

  const destination = (option) => {
    if (option === 'email') {
      return trimmedEmail ? `Sent to ${trimmedEmail}` : 'Sent to the email address above'
    }

    if (trimmedPhone && phoneOk) return `Sent by text to ${trimmedPhone}`
    return 'Sent by text to the mobile number above'
  }

  return (
    <fieldset
      className={`field confirmation-method${error ? ' has-error' : ''}`}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="confirmation-method-legend">
        How would you like to receive your confirmation? <span className="confirmation-method-required">(required)</span>
      </legend>

      <div className="confirmation-method-options">
        {OPTIONS.map((option) => {
          const id = `confirmation-method-${option.value}`
          const checked = value === option.value

          return (
            <label key={option.value} htmlFor={id} className={`confirmation-option${checked ? ' selected' : ''}`}>
              <input
                id={id}
                type="radio"
                name="confirmationMethod"
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                aria-invalid={error ? true : undefined}
              />
              <span className="confirmation-option-text">
                <span className="confirmation-option-label">
                  {option.label}
                  {checked && <span className="confirmation-option-selected">Selected</span>}
                </span>
                <span className="confirmation-option-hint">{destination(option.value)}</span>
              </span>
            </label>
          )
        })}
      </div>

      {value === 'sms' && !phoneOk && !error && (
        <p className="field-hint">Enter an Australian mobile number above (e.g. 0412 345 678) to receive an SMS.</p>
      )}

      {error && (
        <p id={errorId} className="field-error" role="alert">
          <strong>Error: </strong>
          {error}
        </p>
      )}
    </fieldset>
  )
}

export default ConfirmationMethodChoice
