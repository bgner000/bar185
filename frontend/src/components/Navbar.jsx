import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menu' },
  { to: '/events', label: 'Events' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

function Navbar() {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)

  // Escape closes the mobile menu from anywhere inside it, and returns
  // focus to the button that opened it -- a keyboard user never loses
  // their place, and the menu never becomes a trap.
  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <NavLink to="/" className="brand">
          Bar <span>185</span>
        </NavLink>

        <nav
          id="primary-navigation"
          className={`site-nav${open ? ' open' : ''}`}
          aria-label="Primary"
          onClick={() => setOpen(false)}
        >
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {link.label}
            </NavLink>
          ))}

          <NavLink to="/book" className="btn btn-primary btn-sm nav-cta">
            Book a Table
          </NavLink>
        </nav>

        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  )
}

export default Navbar
