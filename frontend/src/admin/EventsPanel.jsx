import { useEffect, useId, useState } from 'react'
import api from '../lib/api'
import ConfirmDialog from '../components/ConfirmDialog'
import StatusBadge from '../components/StatusBadge'
import { Alert, LoadingState, EmptyState } from '../components/Feedback'
import { formatDateTime } from '../lib/format'
import { useModalFocus } from '../lib/useModalFocus'

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
  const titleId = useId()
  const panelRef = useModalFocus({
    onEscape: onClose,
    locked: submitting,
    initialFocusSelector: '#edit-event-title',
  })

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

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        ref={panelRef}
        className="modal-panel modal-panel-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            Edit event
          </h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Close dialog"
            disabled={submitting}
            onClick={onClose}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="alert alert-error modal-error" role="alert">
            <p>
              <strong>Error: </strong>
              {error}
            </p>
          </div>
        )}

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
            <span className="admin-field-static-label">Current status</span>
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
          listing — saving here only updates its details, never its status.
        </p>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Discard changes
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
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
    <form className="admin-panel admin-event-form" onSubmit={handleSubmit} aria-labelledby="event-form-title">
      <h3 id="event-form-title" className="admin-panel-title">
        New event
      </h3>

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

      <div className="admin-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Discard
        </button>
      </div>
    </form>
  )
}

function EventCard({ event, isBusy, onEdit, onInstantStatusChange, onConfirmStatusChange }) {
  // Visible button text names the action; the visually-hidden suffix gives
  // each one a unique accessible name (e.g. "Edit event “Friday Jazz Trio”")
  // so a screen-reader button list isn't a column of identical "Edit"s.
  const forTitle = <span className="visually-hidden"> “{event.title}”</span>

  return (
    <li className="admin-record">
      <div className="admin-record-head">
        <div>
          <h4 className="admin-record-title">{event.title}</h4>
          <p className="admin-record-meta">
            <span>
              {formatDateTime(event.starts_at)}
              {event.ends_at ? ` – ${formatDateTime(event.ends_at)}` : ''}
            </span>
          </p>
        </div>
        <StatusBadge status={event.status} />
      </div>

      <dl className="admin-record-details">
        <div>
          <dt>Reference</dt>
          <dd>{event.event_reference}</dd>
        </div>
        <div>
          <dt>Tag</dt>
          <dd>{event.tag || 'Not set'}</dd>
        </div>
        <div>
          <dt>Created by</dt>
          <dd>{event.created_by_name || 'Unknown'}</dd>
        </div>
      </dl>

      {event.description && (
        <div className="admin-record-message">
          <p>{event.description}</p>
        </div>
      )}

      <div className="admin-actions">
        <button type="button" className="btn btn-secondary btn-sm" disabled={isBusy} onClick={onEdit}>
          Edit event{forTitle}
        </button>

        {event.status === 'draft' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isBusy}
            onClick={() => onInstantStatusChange(event, 'published')}
          >
            {isBusy ? 'Working…' : <>Publish event{forTitle}</>}
          </button>
        )}

        {event.status === 'published' && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={isBusy}
            onClick={() => onInstantStatusChange(event, 'draft')}
          >
            {isBusy ? 'Working…' : <>Unpublish event{forTitle}</>}
          </button>
        )}

        {(event.status === 'draft' || event.status === 'published') && (
          <button
            type="button"
            className="btn btn-danger-outline btn-sm"
            disabled={isBusy}
            onClick={() => onConfirmStatusChange('cancelled')}
          >
            Cancel event{forTitle}
          </button>
        )}

        {event.status !== 'archived' && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={isBusy}
            onClick={() => onConfirmStatusChange('archived')}
          >
            Archive event{forTitle}
          </button>
        )}
      </div>
    </li>
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
      <div className="admin-page-head">
        <h2 className="admin-section-title">Events</h2>
        {!showCreateForm && !editingEvent && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
            Create event
          </button>
        )}
      </div>

      {actionError && (
        <Alert type="error" title="Action failed">
          {actionError}
        </Alert>
      )}

      {showCreateForm && (
        <EventForm submitLabel="Create event" onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
      )}

      <section className="admin-subsection" aria-labelledby="events-upcoming-heading">
        <h3 id="events-upcoming-heading" className="admin-subsection-title">
          Upcoming
        </h3>
        {upcoming.length === 0 ? (
          <EmptyState label="No upcoming events." />
        ) : (
          <ul className="admin-record-list">{upcoming.map(renderCard)}</ul>
        )}
      </section>

      <section className="admin-subsection" aria-labelledby="events-history-heading">
        <h3 id="events-history-heading" className="admin-subsection-title">
          History
        </h3>
        {history.length === 0 ? (
          <EmptyState label="No past events yet." />
        ) : (
          <ul className="admin-record-list">{history.map(renderCard)}</ul>
        )}
      </section>

      {confirmTarget && confirmTarget.action === 'cancelled' && (
        <ConfirmDialog
          title="Cancel this event?"
          description="It will no longer appear in the public Upcoming Events list. This can't be undone from here — only archived afterward."
          confirmLabel="Cancel event"
          cancelLabel="Keep event"
          danger
          onConfirm={handleConfirmedStatusChange}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <dt>Event</dt>
              <dd>{confirmTarget.event.title}</dd>
            </div>
            <div>
              <dt>Starts</dt>
              <dd>{formatDateTime(confirmTarget.event.starts_at)}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{confirmTarget.event.event_reference}</dd>
            </div>
          </dl>
        </ConfirmDialog>
      )}

      {confirmTarget && confirmTarget.action === 'archived' && (
        <ConfirmDialog
          title="Archive this event?"
          description="Archived events stay in history but this can't be undone from here."
          confirmLabel="Archive event"
          cancelLabel="Go back"
          danger
          onConfirm={handleConfirmedStatusChange}
          onClose={closeConfirm}
        >
          <dl className="modal-detail-list">
            <div>
              <dt>Event</dt>
              <dd>{confirmTarget.event.title}</dd>
            </div>
            <div>
              <dt>Starts</dt>
              <dd>{formatDateTime(confirmTarget.event.starts_at)}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{confirmTarget.event.event_reference}</dd>
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
