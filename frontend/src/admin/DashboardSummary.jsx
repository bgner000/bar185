function DashboardSummary({ bookings, largeGroupRequests, eventEnquiries }) {
  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed').length
  const pendingLargeGroup = largeGroupRequests.filter((r) => r.status === 'pending').length
  const openEnquiries = eventEnquiries.filter(
    (e) => !['closed', 'declined'].includes(e.status)
  ).length

  const cards = [
    { label: 'Confirmed Bookings', value: confirmedBookings },
    { label: 'Pending Large-Group Requests', value: pendingLargeGroup },
    { label: 'Open Event Enquiries', value: openEnquiries },
  ]

  return (
    <div className="grid grid-3 admin-summary">
      {cards.map((card) => (
        <div className="card admin-summary-card" key={card.label}>
          <span className="admin-summary-value">{card.value}</span>
          <span className="admin-summary-label">{card.label}</span>
        </div>
      ))}
    </div>
  )
}

export default DashboardSummary
