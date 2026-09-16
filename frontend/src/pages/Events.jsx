import SectionHead from '../components/SectionHead'
import EventEnquiryForm from '../components/EventEnquiryForm'
import { upcomingEvents } from '../data/events'
import { formatDateTime } from '../lib/format'

function Events() {
  return (
    <>
      <section className="section section-tight">
        <div className="container">
          <SectionHead eyebrow="Events & Functions" title="Private events at Bar 185">
            From birthdays to corporate nights, our semi-private area seats up to 30 guests,
            with tailored drink packages and canapé menus available on request.
          </SectionHead>

          <div className="grid grid-3">
            <div className="card">
              <h3>Celebrations</h3>
              <p>Birthdays, engagements, and milestone nights with a reserved space.</p>
            </div>
            <div className="card">
              <h3>Corporate</h3>
              <p>End-of-week drinks, launches, and team celebrations.</p>
            </div>
            <div className="card">
              <h3>Group Bookings</h3>
              <p>Parties of 9 or more are arranged directly with our events team.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-tint">
        <div className="container">
          <SectionHead eyebrow="What's On" title="Upcoming Events">
            Regular nights on the calendar — no booking required unless noted.
          </SectionHead>

          <div className="grid grid-3">
            {upcomingEvents.map((event) => (
              <div className="card event-preview-card" key={event.id}>
                <span className="badge badge-info">{event.tag}</span>
                <h3>{event.title}</h3>
                <p>{event.tagline}</p>
                <span className="event-date">{formatDateTime(event.startsAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="enquiry">
        <div className="container narrow">
          <SectionHead eyebrow="Get in Touch" title="Enquire About Your Event">
            Tell us what you're planning and our events team will follow up with availability
            and options.
          </SectionHead>

          <EventEnquiryForm />
        </div>
      </section>
    </>
  )
}

export default Events
