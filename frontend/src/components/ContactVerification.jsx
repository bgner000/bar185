import { useEffect, useState } from 'react'
import api from '../lib/api'
import { Alert } from './Feedback'

function maskEmail(value) {
  const atIndex = value.indexOf('@')
  if (atIndex < 1) return value

  const user = value.slice(0, atIndex)
  const domain = value.slice(atIndex)
  const visible = user.slice(0, Math.min(2, user.length))

  return `${visible}${'•'.repeat(Math.max(user.length - visible.length, 3))}${domain}`
}

function maskPhone(value) {
  const digits = value.replace(/\D/g, '')
  const last3 = digits.slice(-3)

  return `•••• ••• ${last3}`
}

// Verification state itself lives here (channel picked, send/verify status,
// resend cooldown); the parent only receives the FINAL result via
// onVerified, and always tells this component whether that result is still
// current for the email/phone currently in the form (see BookingForm's
// isVerificationCurrent). That keeps "did the customer edit the field after
// verifying" as one derived check in one place, computed from real values
// every render, rather than state that has to be reset in an effect.
function ContactVerification({ email, phone, verification, onVerified }) {
  const [channel, setChannel] = useState(null) // 'sms' | 'email' | null
  const [sendState, setSendState] = useState('idle') // idle | sending | sent | error
  const [sendError, setSendError] = useState('')
  const [verificationId, setVerificationId] = useState(null)
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [verifyState, setVerifyState] = useState('idle') // idle | verifying | error
  const [verifyError, setVerifyError] = useState('')
  const [cooldownEndsAt, setCooldownEndsAt] = useState(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  // A plain countdown timer -- synchronizing on-screen state with the
  // passage of real time is exactly what an effect is for, unlike deriving
  // UI state from props (which this component deliberately avoids doing).
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

  // The value that was actually sent to, vs. what's in the form now -- if
  // they've diverged, the in-progress send/code no longer applies to what's
  // about to be submitted. Falling back to the idle channel-picker (rather
  // than clearing state via an effect) is enough to make that safe.
  const activeFieldValue = channel === 'sms' ? phone.trim() : email.trim()
  const isCurrent = Boolean(sentTo) && sentTo === activeFieldValue
  const effectiveSendState = isCurrent ? sendState : 'idle'

  const startSend = async (chosenChannel) => {
    const destinationValue = chosenChannel === 'sms' ? phone.trim() : email.trim()

    setChannel(chosenChannel)
    setSendState('sending')
    setSendError('')
    setVerifyState('idle')
    setVerifyError('')
    setCode('')
    // Set before the request resolves, not just on success -- effectiveSendState
    // below depends on sentTo matching the current field to decide whether to
    // show this attempt's result at all. If a failed attempt left sentTo
    // unset, isCurrent would be false and the error would never render.
    setSentTo(destinationValue)
    onVerified(null)

    try {
      const data = await api.sendVerificationCode({
        channel: chosenChannel,
        email: chosenChannel === 'email' ? destinationValue : undefined,
        phone: chosenChannel === 'sms' ? destinationValue : undefined,
      })

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
      onVerified({ channel, verificationId, rawValue: sentTo })
    } catch (error) {
      setVerifyState('error')
      setVerifyError(error.message)
    }
  }

  if (verification) {
    const label = verification.channel === 'sms' ? 'Phone verified' : 'Email verified'

    return (
      <div className="field">
        <label>Contact verification</label>
        <Alert type="success">✓ {label}</Alert>
      </div>
    )
  }

  return (
    <div className="field verification-block">
      <label>Contact verification</label>
      <p className="field-hint">
        Verify your phone or email before confirming — only one is required.
      </p>

      {effectiveSendState === 'idle' && (
        <div className="verification-channel-buttons">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!phone.trim()}
            onClick={() => startSend('sms')}
          >
            Verify by SMS
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!email.trim()}
            onClick={() => startSend('email')}
          >
            Verify by Email
          </button>
        </div>
      )}

      {effectiveSendState === 'sending' && <p className="field-hint">Sending code…</p>}

      {effectiveSendState === 'error' && (
        <>
          <Alert type="error">{sendError}</Alert>
          <div className="verification-channel-buttons">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!phone.trim() || cooldownRemaining > 0}
              onClick={() => startSend('sms')}
            >
              Try SMS
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!email.trim() || cooldownRemaining > 0}
              onClick={() => startSend('email')}
            >
              Try Email
            </button>
          </div>
          {cooldownRemaining > 0 && (
            <span className="field-hint">Try again in {cooldownRemaining}s</span>
          )}
        </>
      )}

      {effectiveSendState === 'sent' && (
        <div className="verification-code-entry">
          <p className="field-hint">
            We sent a 6-digit code to{' '}
            <strong>{channel === 'sms' ? maskPhone(sentTo) : maskEmail(sentTo)}</strong>
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => startSend(channel)}>
                Resend code
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => startSend(channel === 'sms' ? 'email' : 'sms')}
              disabled={(channel === 'sms' ? !email.trim() : !phone.trim())}
            >
              Use {channel === 'sms' ? 'email' : 'SMS'} instead
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ContactVerification
