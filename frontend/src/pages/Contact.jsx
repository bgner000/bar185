import { Link } from 'react-router-dom'
import SectionHead from '../components/SectionHead'

const HOURS = [
  { day: 'Monday', hours: 'Closed' },
  { day: 'Tuesday', hours: '4pm – 11pm' },
  { day: 'Wednesday', hours: '4pm – 11pm' },
  { day: 'Thursday', hours: '4pm – Midnight' },
  { day: 'Friday', hours: '3pm – 1am' },
  { day: 'Saturday', hours: '2pm – 1am' },
  { day: 'Sunday', hours: '2pm – 10pm' },
]

function Contact() {
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
          <ul className="hours-list">
            {HOURS.map((row) => (
              <li key={row.day}>
                <span>{row.day}</span>
                <span>{row.hours}</span>
              </li>
            ))}
          </ul>
          <p className="field-hint">Kitchen closes 30 minutes before last drinks.</p>
        </div>
      </div>
    </section>
  )
}

export default Contact
