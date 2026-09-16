import { useEffect, useState } from 'react'
import SectionHead from '../components/SectionHead'
import EventEnquiryForm from '../components/EventEnquiryForm'
import VenueImage from '../components/VenueImage'
import { venueImages } from '../data/venueImages'
import { LoadingState, EmptyState, Alert } from '../components/Feedback'
import api from '../lib/api'
import { formatDateTime } from '../lib/format'

function Events() {
  const [events, setEvents] = useState(undefined) // undefined = loading
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getEvents()
      .then((data) => setEvents(data.events))
      .catch(() => setError('Could not load events right now. Please try again shortly.'))
  }, [])

  return (
    <>
      <section className="hero events-hero">
        <VenueImage
          image={venueImages.liveMusicStage}
          className="hero-photo"
          objectPosition="50% 35%"
          loading="eager"
          fetchPriority="high"
        />
        <div className="hero-photo-overlay" />

        <div className="container hero-inner">
          <span className="eyebrow">Events &amp; Functions</span>
          <h1>Live music &amp; private events</h1>
          <p className="hero-lede">
            From birthdays to corporate nights, our semi-private area seats up to 30 guests,
            with tailored drink packages and canapé menus available on request.
          </p>
        </div>
      </section>

      <section className="section section-tight">
        <div className="container">
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
        <div className="container events-feature-grid">
          <VenueImage
            image={venueImages.liveMusicVertical}
            className="events-feature-photo"
          />

          <div>
            <span className="eyebrow">Live Music</span>
            <h2>A stage worth showing up for</h2>
            <p>
              Local musicians play regular sets through the week — acoustic duos, jazz trios,
              and the odd surprise guest. No cover, no booking required, just turn up.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="What's On" title="Upcoming Events">
            Regular nights on the calendar — no booking required unless noted.
          </SectionHead>

          {error && <Alert type="error">{error}</Alert>}

          {events === undefined && !error && <LoadingState label="Loading events…" />}

          {events && events.length === 0 && !error && (
            <EmptyState label="No upcoming events right now — check back soon." />
          )}

          {events && events.length > 0 && (
            <div className="grid grid-3">
              {events.map((event) => (
                <div className="card event-preview-card" key={event.eventReference}>
                  <span className="badge badge-info">{event.tag || 'Event'}</span>
                  <h3>{event.title}</h3>
                  {event.description && <p>{event.description}</p>}
                  <span className="event-date">{formatDateTime(event.startsAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section section-tint" id="enquiry">
        <div className="container enquiry-grid">
          <div className="enquiry-intro">
            <VenueImage
              image={venueImages.audioMixingConsole}
              className="enquiry-photo"
              objectPosition="50% 45%"
            />
            <SectionHead eyebrow="Get in Touch" title="Enquire About Your Event">
              Tell us what you're planning and our events team will follow up with
              availability and options for our upstairs space.
            </SectionHead>
          </div>

          <EventEnquiryForm />
        </div>
      </section>
    </>
  )
}

export default Events
