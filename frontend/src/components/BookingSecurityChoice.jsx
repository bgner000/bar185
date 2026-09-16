import { useEffect, useState } from 'react'
import api from '../lib/api'
import { isLikelyEmail, isLikelyAuMobile } from '../lib/validation'
import { Alert } from './Feedback'

function maskEmail(value) {
  const atIndex = value.indexOf('@')
  if (atIndex < 1) return value

  const user = value.slice(0, atIndex)
  const domain = value.slice(atIndex)
  const visible = user.slice(0, Math.min(2, user.length))

  return `${visible}${'•'.repeat(Math.max(user.length - visible.length, 3))}${domain}`
}

// The existing free email OTP flow, unchanged in behaviour -- same states
// (idle/sending/sent/error, verifying/error), same cooldown timer, same
// masking, same resend. The only thing removed is the SMS alternative that
// used to live alongside it here; SMS OTP as a way to secure a *booking*
// is replaced by the deposit option, not by anything in this panel.
function EmailVerificationPanel({ email, verification, onVerified }) {
  const [sendState, setSendState] = useState('idle') // idle | sending | sent | error
  const [sendError, setSendError] = useState('')
  const [verificationId, setVerificationId] = useState(null)
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [verifyState, setVerifyState] = useState('idle') // idle | verifying | error
  const [verifyError, setVerifyError] = useState('')
  const [cooldownEndsAt, setCooldownEndsAt] = useState(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  useEffect(() => {
    if (cooldownEndsAt === null) return undefined

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000))
      setCooldownRemaining(remaining)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [cooldownEndsAt])

  const activeFieldValue = email.trim()
  const isCurrent = Boolean(sentTo) && sentTo === activeFieldValue
  const effectiveSendState = isCurrent ? sendState : 'idle'
  const emailValid = isLikelyEmail(email)

  const startSend = async () => {
    const destinationValue = email.trim()

    setSendState('sending')
    setSendError('')
    setVerifyState('idle')
    setVerifyError('')
    setCode('')
    setSentTo(destinationValue)
    onVerified(null)

    try {
      const data = await api.sendVerificationCode({ channel: 'email', email: destinationValue })

      setVerificationId(data.verificationId)
      setSendState('sent')
      setCooldownEndsAt(Date.now() + data.resendCooldownSeconds * 1000)
    } catch (error) {
      setSendState('error')
      setSendError(error.message)
      if (error.body?.retryAfterSeconds) {
        setCooldownEndsAt(Date.now() + error.body.retryAfterSeconds * 1000)
      }
    }
  }

  const handleVerify = async (event) => {
    event.preventDefault()
    setVerifyState('verifying')
    setVerifyError('')

    try {
      await api.verifyCode({ verificationId, code: code.trim() })
      setVerifyState('idle')
      onVerified({ channel: 'email', verificationId, rawValue: sentTo })
    } catch (error) {
      setVerifyState('error')
      setVerifyError(error.message)
    }
  }

  if (verification) {
    return <Alert type="success">✓ Email verified</Alert>
  }

  return (
    <div>
      {effectiveSendState === 'idle' && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={!emailValid} onClick={startSend}>
          Send verification code
        </button>
      )}

      {effectiveSendState === 'sending' && <p className="field-hint">Sending code…</p>}

      {effectiveSendState === 'error' && (
        <>
          <Alert type="error">{sendError}</Alert>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!emailValid || cooldownRemaining > 0}
            onClick={startSend}
          >
            Try again
          </button>
          {cooldownRemaining > 0 && <span className="field-hint">Try again in {cooldownRemaining}s</span>}
        </>
      )}

      {effectiveSendState === 'sent' && (
        <div className="verification-code-entry">
          <p className="field-hint">
            We sent a 6-digit code to <strong>{maskEmail(sentTo)}</strong>
          </p>

          {verifyState === 'error' && <Alert type="error">{verifyError}</Alert>}

          <div className="field-row verification-code-row">
            <input
              className="verification-code-input"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={verifyState === 'verifying'}
              aria-label="Verification code"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={code.length !== 6 || verifyState === 'verifying'}
              onClick={handleVerify}
            >
              {verifyState === 'verifying' ? 'Verifying…' : 'Verify'}
            </button>
          </div>

          <div className="verification-resend">
            <span className="field-hint">Didn't receive it?</span>
            {cooldownRemaining > 0 ? (
              <span className="field-hint">Resend code in {cooldownRemaining}s</span>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={startSend}>
                Resend code
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// No payment provider is connected yet (see backend/payments/), so this
// panel only ever confirms the phone number is valid -- it never claims a
// deposit has been paid. Attempting to actually confirm the booking with
// this method currently returns a clear, honest failure from the backend
// (see BookingForm's submit handling) rather than a fake success.
function DepositPanel({ phone }) {
  const phoneValid = isLikelyAuMobile(phone)

  return (
    <div>
      <p className="field-hint">
        Enter your phone number above to continue. A$10 will be charged as a booking deposit,
        credited toward your bill when you attend, and refunded if you cancel at least 12 hours
        before your booking.
      </p>
      {!phoneValid && <p className="field-hint">A valid Australian mobile number is required.</p>}
      <Alert type="info">
        Card payments aren't connected yet in this preview. Confirming with this option will show
        a clear message rather than completing a real charge — choose email verification to book
        today.
      </Alert>
    </div>
  )
}

// Lets a customer pick how to secure a standard table booking: the
// existing free email OTP flow, or a refundable A$10 deposit (structure
// only for now -- see DepositPanel and backend/payments/). `method` and
// `verification` are lifted to BookingForm, which is the single source of
// truth for whether the booking can actually be submitted.
function BookingSecurityChoice({ email, phone, method, onMethodChange, verification, onVerified }) {
  return (
    <div className="field verification-block">
      <label>Choose how you'd like to secure your booking</label>

      <div className="security-method-grid">
        <button
          type="button"
          className={`security-method-option${method === 'email' ? ' selected' : ''}`}
          onClick={() => onMethodChange('email')}
        >
          <span className="security-method-title">
            Verify by Email
            <span className="badge badge-success">Free</span>
          </span>
          <span className="security-method-description">Receive a 6-digit verification code by email.</span>
        </button>

        <button
          type="button"
          className={`security-method-option${method === 'deposit' ? ' selected' : ''}`}
          onClick={() => onMethodChange('deposit')}
        >
          <span className="security-method-title">A$10 Booking Deposit</span>
          <span className="security-method-description">
            Secure your booking with a A$10 deposit. The deposit is credited toward your bill when
            you attend. Refundable when cancelled at least 12 hours before your booking.
          </span>
        </button>
      </div>

      {method === 'email' && (
        <EmailVerificationPanel email={email} verification={verification} onVerified={onVerified} />
      )}

      {method === 'deposit' && <DepositPanel phone={phone} />}
    </div>
  )
}

export default BookingSecurityChoice
