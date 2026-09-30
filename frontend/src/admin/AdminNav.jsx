const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'large-group', label: 'Large-Group Requests', countLabel: 'pending' },
  { id: 'enquiries', label: 'Event Enquiries', countLabel: 'open' },
  { id: 'events', label: 'Events' },
  { id: 'menu', label: 'Menu' },
]

// Sections are switched in place via the ?section= query param (see
// AdminDashboard), so these stay buttons rather than links. The current
// section is marked with aria-current so assistive tech announces it, and
// visually by a left rule + bolder weight + tinted background -- never by
// colour alone.
function AdminNav({ active, onChange, counts }) {
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      <ul className="admin-nav-list">
        {SECTIONS.map((section) => {
          const isActive = active === section.id
          const count = counts[section.id]

          return (
            <li key={section.id}>
              <button
                type="button"
                className={`admin-nav-item${isActive ? ' active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onChange(section.id)}
              >
                <span>{section.label}</span>
                {count > 0 && (
                  <span className="admin-nav-count">
                    {count}
                    <span className="visually-hidden"> {section.countLabel}</span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default AdminNav
