import { useEffect, useState } from 'react'
import api from '../lib/api'
import ConfirmDialog from '../components/ConfirmDialog'
import StatusBadge from '../components/StatusBadge'
import { Alert, LoadingState, EmptyState } from '../components/Feedback'
import { formatDateTime } from '../lib/format'

const EMPTY_FORM = { title: '', description: '', tag: '', startsAt: '', endsAt: '' }

const TERMINAL_STATUSES = ['cancelled', 'completed', 'archived']

// A published event without ends_at is treated as finished once it starts
// -- mirrors the public listing's own COALESCE(ends_at, starts_at) fallback,
// so "upcoming" here always matches what the public page currently shows.
function isFinished(event) {
  const endBasis = event.ends_at || event.starts_at
  return new Date(endBasis).getTime() <= Date.now()
}

// <input type="datetime-local"> reads/writes local wall-clock time with no
// timezone of its own -- same convention BookingForm/EventEnquiryForm
// already use elsewhere in this app, so this just mirrors that.
function toDateTimeLocalValue(isoString) {
  if (!isoString) return ''

  const date = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
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

      {editingEvent && (
        <EventForm
          key={editingEvent.event_reference}
          initial={{
            title: editingEvent.title,
            description: editingEvent.description || '',
            tag: editingEvent.tag || '',
            startsAt: toDateTimeLocalValue(editingEvent.starts_at),
            endsAt: toDateTimeLocalValue(editingEvent.ends_at),
          }}
          submitLabel="Save Changes"
          onSubmit={handleEdit}
          onCancel={() => setEditingReference('')}
        />
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
    </div>
  )
}

export default EventsPanel
