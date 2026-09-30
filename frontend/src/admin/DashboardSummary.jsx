function DashboardSummary({ bookings, largeGroupRequests, eventEnquiries }) {
  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed').length
  const pendingLargeGroup = largeGroupRequests.filter((r) => r.status === 'pending').length
  const openEnquiries = eventEnquiries.filter(
    (e) => !['closed', 'declined'].includes(e.status)
  ).length

  const stats = [
    { label: 'Confirmed bookings', value: confirmedBookings },
    { label: 'Pending large-group requests', value: pendingLargeGroup },
    { label: 'Open event enquiries', value: openEnquiries },
  ]

  return (
    <dl className="admin-stats">
      {stats.map((stat) => (
        <div className="admin-stat" key={stat.label}>
          <dt className="admin-stat-label">{stat.label}</dt>
          <dd className="admin-stat-value">{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default DashboardSummary
