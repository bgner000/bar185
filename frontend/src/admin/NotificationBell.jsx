import { useEffect, useRef, useState } from 'react'
import api from '../lib/api'
import { Alert, LoadingState, EmptyState } from '../components/Feedback'
import { formatRelativeTime } from '../lib/format'

const POLL_INTERVAL_MS = 30000

// Where clicking a notification should take the admin. Anything not listed
// here (e.g. a future 'system' entity_type) just marks read and closes the
// panel without navigating -- there's no dashboard section for it to jump to.
const SECTION_BY_ENTITY_TYPE = {
  booking: 'bookings',
  large_group_request: 'large-group',
  event_enquiry: 'enquiries',
}

// The stable, human-meaningful reference each notify* function (see
// backend/adminNotifications) already stores in metadata for exactly this
// purpose -- never the numeric entity_id, which is an internal row id, not
// something any admin page filters or searches by.
const FOCUS_METADATA_KEY_BY_ENTITY_TYPE = {
  booking: 'bookingReference',
  large_group_request: 'requestReference',
  event_enquiry: 'enquiryReference',
}

function NotificationBell({ onNavigate }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)

  const wrapRef = useRef(null)

  const loadNotifications = () =>
    api
      .getAdminNotifications()
      .then((data) => {
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
        setError('')
      })
      .catch((err) => setError(err.message))

  // Initial load + background polling. A failed poll just leaves the last
  // good list in place (loadNotifications only clears `error` on success),
  // so a flaky network never blanks out notifications the admin already saw.
  useEffect(() => {
    loadNotifications().finally(() => setLoading(false))

    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  // Close on outside click or Escape -- only wired up while open, so this
  // never adds listeners the dashboard doesn't need.
  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleMarkAllRead = async () => {
    setMarkingAll(true)

    try {
      await api.markAllNotificationsRead()
      setNotifications((current) => current.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (err) {
      setError(err.message)
    } finally {
      setMarkingAll(false)
    }
  }

  const handleNotificationClick = async (notification) => {
    setOpen(false)

    if (!notification.is_read) {
      setNotifications((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((current) => Math.max(current - 1, 0))

      try {
        const data = await api.markNotificationRead(notification.id)
        setUnreadCount(data.unreadCount)
      } catch {
        // Best-effort -- the notification stays visually read for this
        // session even if the server update failed; the next poll will
        // reconcile the real state.
      }
    }

    const section = SECTION_BY_ENTITY_TYPE[notification.entity_type]
    if (!section) return

    const metadataKey = FOCUS_METADATA_KEY_BY_ENTITY_TYPE[notification.entity_type]
    const focusReference = metadataKey ? notification.metadata?.[metadataKey] : undefined

    onNavigate(section, focusReference)
  }

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
          <path
            d="M12 3.5c-3 0-4.8 2.1-4.8 5.2v2.6c0 .9-.3 1.7-.9 2.5l-.9 1.2c-.5.7 0 1.7.9 1.7h11.4c.9 0 1.4-1 .9-1.7l-.9-1.2c-.6-.8-.9-1.6-.9-2.5V8.7c0-3.1-1.8-5.2-4.8-5.2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9.8 19a2.3 2.3 0 0 0 4.4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && <span className="notif-badge">{badgeLabel}</span>}
      </button>

      {open && (
        <div className="notif-dropdown" role="menu" aria-label="Notifications">
          <div className="notif-dropdown-header">
            <h3>Notifications</h3>
            <button
              type="button"
              className="notif-mark-all"
              onClick={handleMarkAllRead}
              disabled={markingAll || unreadCount === 0}
            >
              Mark all as read
            </button>
          </div>

          <div className="notif-list">
            {loading && <LoadingState label="Loading notifications…" />}

            {!loading && error && (
              <div className="notif-list-message">
                <Alert type="error" title="Could not load notifications">
                  {error}
                </Alert>
              </div>
            )}

            {!loading && !error && notifications.length === 0 && (
              <div className="notif-list-message">
                <EmptyState label="You're all caught up. No new notifications." />
              </div>
            )}

            {!loading &&
              !error &&
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  role="menuitem"
                  className={`notif-item${notification.is_read ? '' : ' unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className={`notif-dot${notification.is_read ? ' notif-dot-read' : ''}`} aria-hidden="true" />
                  <span className="notif-content">
                    <span className="notif-title">{notification.title}</span>
                    <span className="notif-message">{notification.message}</span>
                    <span className="notif-time">{formatRelativeTime(notification.created_at)}</span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
