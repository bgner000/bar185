import { useEffect, useState } from 'react'
import api from '../lib/api'
import ConfirmDialog from '../components/ConfirmDialog'
import StatusBadge from '../components/StatusBadge'
import { Alert, LoadingState, EmptyState } from '../components/Feedback'
import { formatDateTime } from '../lib/format'

function toDateValue(isoString) {
  if (!isoString) return ''

  const date = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toTimeValue(isoString) {
  if (!isoString) return ''

  const date = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// A true overlay modal (not an inline block) so Edit always appears right
// where the admin is looking, however far down the Upcoming/History list
// they've scrolled -- an inline form injected at the top of the page reads
// as "the button did nothing" once the list is long. Content fields only:
// status changes stay on the card's own Publish/Unpublish/Cancel/Archive
// buttons, so editing details can never silently change what's public.
function EventEditModal({ event, onSave, onClose }) {
  const [form, setForm] = useState({
    title: event.title,
    tag: event.tag || '',
    description: event.description || '',
    startDate: toDateValue(event.starts_at),
    startTime: toTimeValue(event.starts_at),
    endDate: toDateValue(event.ends_at),
    endTime: toTimeValue(event.ends_at),
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (changeEvent) => {
    const { name, value } = changeEvent.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('Event title is required.')
      return
    }

    if (!form.startDate || !form.startTime) {
      setError('Start date and start time are required.')
      return
    }

    if ((form.endDate && !form.endTime) || (!form.endDate && form.endTime)) {
      setError('Set both an end date and an end time, or leave both blank.')
      return
    }

    const startsAt = new Date(`${form.startDate}T${form.startTime}`)
    const endsAt = form.endDate && form.endTime ? new Date(`${form.endDate}T${form.endTime}`) : null

    if (Number.isNaN(startsAt.getTime())) {
      setError('Start date/time is invalid.')
      return
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
      setError('End date/time is invalid.')
      return
    }

    if (endsAt && endsAt <= startsAt) {
      setError('End time must be after the start time.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await onSave({
        title: form.title,
        description: form.description,
        tag: form.tag,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
      })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const handleOverlayKeyDown = (event2) => {
    if (event2.key === 'Escape' && !submitting) onClose()
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => !submitting && onClose()}
      onKeyDown={handleOverlayKeyDown}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Edit event"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <h3>Edit Event</h3>

        {error && <div className="alert alert-error modal-error">{error}</div>}

        <div className="field">
          <label htmlFor="edit-event-title">Event title</label>
          <input
            id="edit-event-title"
            name="title"
            value={form.title}
            onChange={handleChange}
            disabled={submitting}
            required
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="edit-event-tag">Tag / category</label>
            <input
              id="edit-event-tag"
              name="tag"
              placeholder="Live Music, Trivia, Tasting…"
              value={form.tag}
              onChange={handleChange}
              disabled={submitting}
            />
          </div>

          <div className="field">
            <span className="admin-detail-label">Status</span>
            <div>
              <StatusBadge status={event.status} />
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="edit-event-description">Description</label>
          <textarea
            id="edit-event-description"
            name="description"
            value={form.description}
            onChange={handleChange}
            disabled={submitting}
            rows={3}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="edit-event-start-date">Start date</label>
            <input
              id="edit-event-start-date"
              name="startDate"
              type="date"
              value={form.startDate}
              onChange={handleChange}
              disabled={submitting}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="edit-event-start-time">Start time</label>
            <input
              id="edit-event-start-time"
              name="startTime"
              type="time"
              value={form.startTime}
              onChange={handleChange}
              disabled={submitting}
              required
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="edit-event-end-date">End date (optional)</label>
            <input
              id="edit-event-end-date"
              name="endDate"
              type="date"
              value={form.endDate}
              onChange={handleChange}
              disabled={submitting}
            />
          </div>

          <div className="field">
            <label htmlFor="edit-event-end-time">End time (optional)</label>
            <input
              id="edit-event-end-time"
              name="endTime"
              type="time"
              value={form.endTime}
              onChange={handleChange}
              disabled={submitting}
            />
          </div>
        </div>

        <p className="field-hint">
          To publish, unpublish, cancel, or archive this event, use the buttons on the event
          card — saving here only updates its details, never its status.
        </p>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

const EMPTY_FORM = { title: '', description: '', tag: '', startsAt: '', endsAt: '' }

const TERMINAL_STATUSES = ['cancelled', 'completed', 'archived']

// A published event without ends_at is treated as finished once it starts
// -- mirrors the public listing's own COALESCE(ends_at, starts_at) fallback,
// so "upcoming" here always matches what the public page currently shows.
function isFinished(event) {
  const endBasis = event.ends_at || event.starts_at
  return new Date(endBasis).getTime() <= Date.now()
}

function EventForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await onSubmit({
        title: form.title,
        description: form.description,
        tag: form.tag,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form className="card card-raised" onSubmit={handleSubmit}>
      {error && (
        <Alert type="error" title="Could not save event">
          {error}
        </Alert>
      )}

      <div className="field">
        <label htmlFor="event-title">Title</label>
        <input id="event-title" name="title" value={form.title} onChange={handleChange} required />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="event-tag">Category tag</label>
          <input
            id="event-tag"
            name="tag"
            placeholder="Live Music, Trivia, Tasting…"
            value={form.tag}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="event-description">Description</label>
        <textarea id="event-description" name="description" value={form.description} onChange={handleChange} />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="event-starts">Starts</label>
          <input
            id="event-starts"
            name="startsAt"
            type="datetime-local"
            value={form.startsAt}
            onChange={handleChange}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="event-ends">Ends (optional)</label>
          <input id="event-ends" name="endsAt" type="datetime-local" value={form.endsAt} onChange={handleChange} />
        </div>
      </div>

      <div className="admin-request-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function EventCard({ event, isBusy, onEdit, onInstantStatusChange, onConfirmStatusChange }) {
  return (
    <div className="card admin-request-card">
      <div className="admin-request-head">
        <div>
          <h3>{event.title}</h3>
          <span className="field-hint">
            {formatDateTime(event.starts_at)}
            {event.ends_at ? ` – ${formatDateTime(event.ends_at)}` : ''}
          </span>
        </div>
        <StatusBadge status={event.status} />
      </div>

      <div className="admin-request-details">
        <div>
          <span className="admin-detail-label">Reference</span>
          <span>{event.event_reference}</span>
        </div>
        <div>
          <span className="admin-detail-label">Tag</span>
          <span>{event.tag || 'Not set'}</span>
        </div>
        <div>
          <span className="admin-detail-label">Created by</span>
          <span>{event.created_by_name || 'Unknown'}</span>
        </div>
      </div>

      {event.description && <p className="admin-request-message">{event.description}</p>}

      <div className="admin-request-actions admin-request-actions-wrap">
        <button type="button" className="btn btn-secondary btn-sm" disabled={isBusy} onClick={onEdit}>
          Edit
        </button>

        {event.status === 'draft' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isBusy}
            onClick={() => onInstantStatusChange(event, 'published')}
          >
            {isBusy ? 'Working…' : 'Publish'}
          </button>
        )}

        {event.status === 'published' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isBusy}
            onClick={() => onInstantStatusChange(event, 'draft')}
          >
            {isBusy ? 'Working…' : 'Unpublish'}
          </button>
        )}

        {(event.status === 'draft' || event.status === 'published') && (
          <button
            type="button"
            className="btn btn-danger-outline btn-sm"
            disabled={isBusy}
            onClick={() => onConfirmStatusChange('cancelled')}
          >
            Cancel
          </button>
        )}

        {event.status !== 'archived' && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={isBusy}
            onClick={() => onConfirmStatusChange('archived')}
          >
            Archive
          </button>
        )}
      </div>
    </div>
  )
}

function EventsPanel() {
  const [events, setEvents] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingReference, setEditingReference] = useState('')
  const [busyReference, setBusyReference] = useState('')
  const [confirmTarget, setConfirmTarget] = useState(null) // { event, action }

  const loadEvents = () =>
    api
      .getAdminEvents()
      .then((data) => {
        setEvents(data.events)
        setLoadError('')
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false))

  useEffect(() => {
    loadEvents()
  }, [])

  const handleCreate = async (payload) => {
    await api.createEvent(payload)
    setShowCreateForm(false)
    await loadEvents()
  }

  const handleEdit = async (payload) => {
    await api.updateEvent(editingReference, payload)
    setEditingReference('')
    await loadEvents()
  }

  const runStatusChange = async (event, status) => {
    setActionError('')
    setBusyReference(event.event_reference)

    try {
      await api.updateEventStatus(event.event_reference, status)
      await loadEvents()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setBusyReference('')
    }
  }

  const handleInstantStatusChange = (event, status) => {
    runStatusChange(event, status)
  }

  const closeConfirm = () => setConfirmTarget(null)

  const handleConfirmedStatusChange = async () => {
    await runStatusChange(confirmTarget.event, confirmTarget.action)
    setConfirmTarget(null)
  }

  if (loading) {
    return <LoadingState label="Loading events…" />
  }

  if (loadError) {
    return (
      <Alert type="error" title="Could not load events">
        {loadError}
      </Alert>
    )
  }

  const upcoming = events.filter((event) => !isFinished(event) && !TERMINAL_STATUSES.includes(event.status))
  const history = events.filter((event) => isFinished(event) || TERMINAL_STATUSES.includes(event.status))
  const editingEvent = editingReference ? events.find((event) => event.event_reference === editingReference) : null

  const renderCard = (event) => (
    <EventCard
      key={event.id}
      event={event}
      isBusy={busyReference === event.event_reference}
      onEdit={() => {
        setShowCreateForm(false)
        setEditingReference(event.event_reference)
      }}
      onInstantStatusChange={handleInstantStatusChange}
      onConfirmStatusChange={(action) => setConfirmTarget({ event, action })}
    />
  )

  return (
    <div>
      <h2 className="admin-section-title">Events</h2>

      {actionError && (
        <Alert type="error" title="Action failed">
          {actionError}
        </Alert>
      )}

      {!showCreateForm && !editingEvent && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreateForm(true)}
        >
          Create Event
        </button>
      )}

      {showCreateForm && (
        <EventForm submitLabel="Create Event" onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
      )}

      <h3>Upcoming</h3>
      {upcoming.length === 0 ? (
        <EmptyState label="No upcoming events." />
      ) : (
        <div className="admin-card-list">{upcoming.map(renderCard)}</div>
      )}

      <h3>History</h3>
      {history.length === 0 ? (
        <EmptyState label="No past events yet." />
      ) : (
        <div className="admin-card-list">{history.map(renderCard)}</div>
      )}

      {confirmTarget && confirmTarget.action === 'cancelled' && (
        <ConfirmDialog
          title="Cancel this event?"
          description="It will no longer appear in the public Upcoming Events list. This can't be undone from here — only archived afterward."
          confirmLabel="Cancel Event"
          danger
          onConfirm={handleConfirmedStatusChange}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <span>Event</span>
              <span>{confirmTarget.event.title}</span>
            </div>
            <div>
              <span>Starts</span>
              <span>{formatDateTime(confirmTarget.event.starts_at)}</span>
            </div>
            <div>
              <span>Reference</span>
              <span>{confirmTarget.event.event_reference}</span>
            </div>
          </dl>
        </ConfirmDialog>
      )}

      {confirmTarget && confirmTarget.action === 'archived' && (
        <ConfirmDialog
          title="Archive this event?"
          description="Archived events stay in history but this can't be undone from here."
          confirmLabel="Archive Event"
          danger
          onConfirm={handleConfirmedStatusChange}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <span>Event</span>
              <span>{confirmTarget.event.title}</span>
            </div>
            <div>
              <span>Starts</span>
              <span>{formatDateTime(confirmTarget.event.starts_at)}</span>
            </div>
            <div>
              <span>Reference</span>
              <span>{confirmTarget.event.event_reference}</span>
            </div>
          </dl>
        </ConfirmDialog>
      )}

      {editingEvent && (
        <EventEditModal
          key={editingEvent.event_reference}
          event={editingEvent}
          onSave={handleEdit}
          onClose={() => setEditingReference('')}
        />
      )}
    </div>
  )
}

export default EventsPanel
