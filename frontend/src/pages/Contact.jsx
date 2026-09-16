import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SectionHead from '../components/SectionHead'
import { LoadingState } from '../components/Feedback'
import api from '../lib/api'
import { formatHourLabel, weekdayName } from '../lib/format'

// Monday-first display order, mapping onto the day_of_week values
// (0 = Sunday ... 6 = Saturday) that venue_hours and the booking-slot
// generator both already use.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function Contact() {
  const [hoursByDay, setHoursByDay] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getVenueHours()
      .then((data) => {
        const map = new Map(data.hours.map((row) => [row.day_of_week, row]))
        setHoursByDay(map)
      })
      .catch(() => setError('Could not load opening hours right now.'))
  }, [])

  return (
    <section className="section">
      <div className="container contact-grid">
        <div>
          <SectionHead eyebrow="Contact" title="Get in Touch">
            Details below are indicative for this demo and easy to update once the venue goes
            live.
          </SectionHead>

          <div className="card contact-card">
            <h3>Visit</h3>
            <p>
              185 Illawarra Road
              <br />
              Marrickville NSW 2204
            </p>
          </div>

          <div className="card contact-card">
            <h3>Reach Us</h3>
            <p>
              Phone: (02) 9555 0185
              <br />
              Email: hello@bar185.com.au
            </p>
          </div>

          <div className="contact-actions">
            <Link to="/book" className="btn btn-primary">
              Book a Table
            </Link>
            <Link to="/events#enquiry" className="btn btn-secondary">
              Enquire About an Event
            </Link>
          </div>
        </div>

        <div className="card card-raised hours-card">
          <h3>Opening Hours</h3>

          {!hoursByDay && !error && <LoadingState label="Loading hours…" />}
          {error && <p className="field-hint">{error}</p>}

          {hoursByDay && (
            <ul className="hours-list">
              {DISPLAY_ORDER.map((dayOfWeek) => {
                const row = hoursByDay.get(dayOfWeek)
                const label = weekdayName(dayOfWeek)
                const hours =
                  !row || row.is_closed
                    ? 'Closed'
                    : `${formatHourLabel(row.opens_at)} – ${formatHourLabel(row.closes_at)}`

                return (
                  <li key={dayOfWeek}>
                    <span>{label}</span>
                    <span>{hours}</span>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="field-hint">Kitchen closes 30 minutes before last drinks.</p>
        </div>
      </div>
    </section>
  )
}

export default Contact
