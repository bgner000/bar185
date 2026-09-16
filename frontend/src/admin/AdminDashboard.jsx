import { useEffect, useState } from 'react'
import api, { ADMIN_DEMO_EMAIL } from '../lib/api'
import { Alert, LoadingState } from '../components/Feedback'
import AdminNav from './AdminNav'
import DashboardSummary from './DashboardSummary'
import BookingsPanel from './BookingsPanel'
import LargeGroupPanel from './LargeGroupPanel'
import EnquiriesPanel from './EnquiriesPanel'
import MenuPanel from './MenuPanel'
import './admin.css'

function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [updatingReference, setUpdatingReference] = useState('')
  const [activeSection, setActiveSection] = useState('overview')

  const loadDashboard = () =>
    api
      .getAdminDashboard()
      .then((data) => {
        setDashboard(data)
        setLoadError('')
      })
      .catch((error) => setLoadError(error.message))

  useEffect(() => {
    loadDashboard().finally(() => setLoading(false))
  }, [])

  // These are called from inside ConfirmDialog's onConfirm, which awaits them
  // and shows its own inline error if they throw — so they intentionally do
  // NOT catch errors themselves; catching here would make a failed action
  // look like it succeeded and close the dialog anyway.
  const approveLargeGroupRequest = async (requestReference) => {
    await api.approveLargeGroupRequest(requestReference)
    await loadDashboard()
  }

  const declineLargeGroupRequest = async (requestReference, reason) => {
    await api.declineLargeGroupRequest(requestReference, reason)
    await loadDashboard()
  }

  const updateEventEnquiryStatus = async (enquiryReference, newStatus) => {
    setActionError('')
    setUpdatingReference(enquiryReference)

    try {
      const data = await api.updateEventEnquiryStatus(enquiryReference, newStatus)

      setDashboard((current) => ({
        ...current,
        dashboard: {
          ...current.dashboard,
          eventEnquiries: current.dashboard.eventEnquiries.map((enquiry) =>
            enquiry.enquiry_reference === enquiryReference ? { ...enquiry, ...data.enquiry } : enquiry
          ),
        },
      }))
    } catch (error) {
      setActionError(error.message)
    } finally {
      setUpdatingReference('')
    }
  }

  if (loading) {
    return (
      <div className="admin-shell">
        <LoadingState label="Loading admin dashboard…" />
      </div>
    )
  }

  if (loadError && !dashboard) {
    return (
      <div className="admin-shell admin-shell-center">
        <div className="card" style={{ maxWidth: 480 }}>
          <Alert type="error" title="Could not load dashboard">
            {loadError}
          </Alert>
          <p className="field-hint">
            Confirm the backend is running and that this session is using an approved admin
            account ({ADMIN_DEMO_EMAIL}).
          </p>
        </div>
      </div>
    )
  }

  const { bookings, largeGroupRequests, eventEnquiries } = dashboard.dashboard

  const counts = {
    overview: 0,
    bookings: 0,
    'large-group': largeGroupRequests.filter((r) => r.status === 'pending').length,
    enquiries: eventEnquiries.filter((e) => !['closed', 'declined'].includes(e.status)).length,
    menu: 0,
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Bar 185 Staff</p>
          <h1>Admin Dashboard</h1>
        </div>
        <div className="admin-identity">
          <span>{dashboard.admin.displayName}</span>
          <span className="badge badge-info">{dashboard.admin.role}</span>
        </div>
      </header>

      {actionError && (
        <div className="container-full">
          <Alert type="error" title="Action failed">
            {actionError}
          </Alert>
        </div>
      )}

      <div className="admin-body">
        <AdminNav active={activeSection} onChange={setActiveSection} counts={counts} />

        <div className="admin-content">
          {activeSection === 'overview' && (
            <>
              <h2 className="admin-section-title">Overview</h2>
              <DashboardSummary
                bookings={bookings}
                largeGroupRequests={largeGroupRequests}
                eventEnquiries={eventEnquiries}
              />
            </>
          )}

          {activeSection === 'bookings' && <BookingsPanel />}

          {activeSection === 'large-group' && (
            <>
              <h2 className="admin-section-title">Large-Group Requests</h2>
              <LargeGroupPanel
                requests={largeGroupRequests}
                onApprove={approveLargeGroupRequest}
                onDecline={declineLargeGroupRequest}
              />
            </>
          )}

          {activeSection === 'enquiries' && (
            <>
              <h2 className="admin-section-title">Event Enquiries</h2>
              <EnquiriesPanel
                enquiries={eventEnquiries}
                updatingReference={updatingReference}
                onStatusChange={updateEventEnquiryStatus}
              />
            </>
          )}

          {activeSection === 'menu' && <MenuPanel />}
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
