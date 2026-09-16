import { Link } from 'react-router-dom'
import SectionHead from '../components/SectionHead'
import { menuCategories } from '../data/menu'
import { upcomingEvents } from '../data/events'
import { formatDate, formatCurrency } from '../lib/format'

const featuredItems = [
  { ...menuCategories[0].items[0], category: 'Cocktails' },
  { ...menuCategories[0].items[2], category: 'Cocktails' },
  { ...menuCategories[4].items[4], category: 'Small Plates' },
  { ...menuCategories[1].items[3], category: 'Wine' },
]

function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <span className="eyebrow">Marrickville · Inner West Sydney</span>
          <h1>
            Good drinks, <br />
            good company.
          </h1>
          <p className="hero-lede">
            Bar 185 is a neighbourhood bar built for long evenings — handcrafted cocktails,
            a considered wine list, and small plates made to share.
          </p>
          <div className="hero-actions">
            <Link to="/book" className="btn btn-primary">
              Book a Table
            </Link>
            <Link to="/events" className="btn btn-secondary">
              See Events
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container intro-grid">
          <div>
            <span className="eyebrow">Welcome</span>
            <h2>A bar rooted in the Inner West</h2>
            <p>
              From weeknight wines to weekend celebrations, Bar 185 brings together local
              produce, small-batch spirits, and an easy atmosphere. Pull up a stool at the bar
              or settle in with friends — we keep a table ready either way.
            </p>
            <Link to="/about" className="btn btn-ghost">
              Our story →
            </Link>
          </div>

          <div className="grid grid-3 feature-cards">
            <div className="card">
              <h3>Handcrafted</h3>
              <p>Cocktails built from scratch with house syrups and fresh citrus.</p>
            </div>
            <div className="card">
              <h3>Local First</h3>
              <p>NSW wine and Inner West beer on rotation, poured by people who know them.</p>
            </div>
            <div className="card">
              <h3>Private Events</h3>
              <p>Semi-private space for birthdays, work drinks, and celebrations.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-tint">
        <div className="container">
          <SectionHead eyebrow="On the Menu" title="A taste of what's pouring">
            A short list from our cocktails, wine and small plates menu.
          </SectionHead>

          <div className="grid grid-4 menu-preview-grid">
            {featuredItems.map((item) => (
              <div className="card menu-preview-card" key={item.name}>
                <span className="eyebrow">{item.category}</span>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <span className="menu-price">{formatCurrency(item.price)}</span>
              </div>
            ))}
          </div>

          <div className="section-cta">
            <Link to="/menu" className="btn btn-secondary">
              View Full Menu
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="What's On" title="Upcoming at Bar 185">
            Live music, tastings, and nights worth putting in the diary.
          </SectionHead>

          <div className="grid grid-3">
            {upcomingEvents.map((event) => (
              <div className="card event-preview-card" key={event.id}>
                <span className="badge badge-info">{event.tag}</span>
                <h3>{event.title}</h3>
                <p>{event.tagline}</p>
                <span className="event-date">{formatDate(event.startsAt)}</span>
              </div>
            ))}
          </div>

          <div className="section-cta">
            <Link to="/events" className="btn btn-secondary">
              View All Events
            </Link>
          </div>
        </div>
      </section>

      <section className="section cta-band">
        <div className="container cta-band-inner">
          <div>
            <h2>Planning something bigger?</h2>
            <p>Private functions, engagements, and corporate nights — we'll help you plan it.</p>
          </div>
          <Link to="/book" className="btn btn-primary">
            Enquire About an Event
          </Link>
        </div>
      </section>
    </>
  )
}

export default Home
