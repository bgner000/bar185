import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SectionHead from '../components/SectionHead'
import VenueImage from '../components/VenueImage'
import { venueImages } from '../data/venueImages'
import { menuCategories } from '../data/menu'
import api from '../lib/api'
import { formatDate, formatTime, formatCurrency } from '../lib/format'

const featuredItems = [
  { ...menuCategories[0].items[0], category: 'Cocktails' },
  { ...menuCategories[0].items[2], category: 'Cocktails' },
  { ...menuCategories[4].items[4], category: 'Small Plates' },
  { ...menuCategories[1].items[3], category: 'Wine' },
]

function Home() {
  const [events, setEvents] = useState([])

  useEffect(() => {
    api
      .getEvents()
      .then((data) => setEvents(data.events.slice(0, 3)))
      .catch(() => setEvents([]))
  }, [])

  return (
    <>
      <section className="hero hero-photo-section">
        <VenueImage
          image={venueImages.mainBarAngle}
          className="hero-photo"
          objectPosition="50% 32%"
          loading="eager"
          fetchPriority="high"
        />
        <div className="hero-photo-overlay" />

        <div className="container hero-inner">
          <span className="hero-location">Marrickville · Inner West Sydney</span>
          <h1>
            Good drinks, <br />
            good company.
          </h1>
          <p className="hero-lede">
            A neighbourhood bar built for long evenings — handcrafted cocktails, a considered
            wine list, and small plates made to share.
          </p>
          <div className="hero-actions">
            <Link to="/book" className="btn btn-primary">
              Book a Table
            </Link>
            <Link to="/events" className="link-editorial">
              See what&rsquo;s on <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="editorial-split">
            <VenueImage image={venueImages.mainBarFront} className="editorial-split-photo" />

            <div className="editorial-split-text">
              <h2>A bar rooted in the Inner West</h2>
              <p>
                From weeknight wines to weekend celebrations, Bar 185 brings together local
                produce, small-batch spirits, and an easy atmosphere. Pull up a stool at the bar
                or settle in with friends — we keep a table ready either way.
              </p>
              <Link to="/about" className="link-editorial">
                Our story <span className="arrow">→</span>
              </Link>
            </div>
          </div>

          <p className="statement">
            Cocktails built from scratch, NSW wine and Inner West beer on rotation, and a
            semi-private space upstairs for birthdays, work drinks and celebrations — the
            everyday version of a good night out.
          </p>
        </div>
      </section>

      <section className="section section-dark">
        <div className="container">
          <SectionHead title="Inside Bar 185">
            A look at the room — atmosphere, live music, and the space upstairs.
          </SectionHead>

          <div className="home-gallery-grid">
            <VenueImage
              image={venueImages.upstairsEventSpace}
              className="home-gallery-tile home-gallery-tile-tall"
            />
            <VenueImage image={venueImages.interiorNight} className="home-gallery-tile" />
            <VenueImage image={venueImages.liveMusicStage} className="home-gallery-tile" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container editorial-split editorial-split--reverse">
          <div className="editorial-split-text">
            <h2>A taste of what&rsquo;s pouring</h2>
            <p>
              A short list from our cocktails, wine and small plates menu — the full list changes
              with the season.
            </p>
            <Link to="/menu" className="link-editorial">
              View full menu <span className="arrow">→</span>
            </Link>
          </div>

          <div className="menu-list">
            {featuredItems.map((item) => (
              <div className="menu-row" key={item.name}>
                <span className="menu-row-category">{item.category}</span>
                <div className="menu-row-head">
                  <span className="menu-row-name">{item.name}</span>
                  <span className="menu-row-leader" aria-hidden="true" />
                  <span className="menu-row-price">{formatCurrency(item.price)}</span>
                </div>
                <p className="menu-row-description">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {events.length > 0 && (
        <section className="section section-tint">
          <div className="container editorial-split">
            <VenueImage image={venueImages.liveMusicVertical} className="editorial-split-photo" />

            <div className="editorial-split-text">
              <h2>Upcoming at Bar 185</h2>
              <p>Live music, tastings, and nights worth putting in the diary.</p>

              <div className="event-list event-list--compact">
                {events.map((event) => (
                  <div className="event-row" key={event.eventReference}>
                    <div className="event-row-date">
                      {formatDate(event.startsAt)}
                      <span>{formatTime(event.startsAt)}</span>
                    </div>
                    <div>
                      <h3 className="event-row-title">{event.title}</h3>
                      {event.description && <p className="event-row-description">{event.description}</p>}
                      {event.tag && <span className="event-row-category">{event.tag}</span>}
                    </div>
                  </div>
                ))}
              </div>

              <Link to="/events" className="link-editorial">
                View all events <span className="arrow">→</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="cta-editorial">
        <VenueImage image={venueImages.audioMixingConsole} className="cta-editorial-photo" objectPosition="50% 30%" />
        <div className="cta-editorial-overlay" />
        <div className="container">
          <div className="cta-editorial-inner">
            <h2 className="display">Planning something bigger?</h2>
            <p className="lede">
              Private functions, engagements, and corporate nights — we&rsquo;ll help you plan it.
            </p>
            <Link to="/events#enquiry" className="btn btn-primary">
              Enquire About an Event
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

export default Home
