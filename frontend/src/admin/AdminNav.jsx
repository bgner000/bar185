const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'large-group', label: 'Large-Group Requests' },
  { id: 'enquiries', label: 'Event Enquiries' },
  { id: 'menu', label: 'Menu' },
]

function AdminNav({ active, onChange, counts }) {
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`admin-nav-item${active === section.id ? ' active' : ''}`}
          onClick={() => onChange(section.id)}
        >
          <span>{section.label}</span>
          {counts[section.id] > 0 && <span className="admin-nav-count">{counts[section.id]}</span>}
        </button>
      ))}
    </nav>
  )
}

export default AdminNav
