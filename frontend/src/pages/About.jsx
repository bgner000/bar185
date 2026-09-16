import { Link } from 'react-router-dom'
import SectionHead from '../components/SectionHead'

function About() {
  return (
    <>
      <section className="section section-tight">
        <div className="container narrow">
          <SectionHead eyebrow="About Us" title="Bar 185">
            A neighbourhood bar in Marrickville, built around good drinks, local produce, and
            unhurried evenings.
          </SectionHead>

          <p>
            Bar 185 opened with a simple idea: a bar the Inner West could make its own. We
            keep the drinks list tight and considered, lean on producers from around NSW, and
            treat the small plates menu with the same care as the cocktails.
          </p>
          <p>
            Whether you're in for a quick glass of wine after work or settling in for a long
            night with friends, the room is built to feel the same — warm, a little dim, and
            never rushed.
          </p>
        </div>
      </section>

      <section className="section section-tint">
        <div className="container">
          <div className="grid grid-4">
            <div className="card">
              <h3>Handcrafted</h3>
              <p>Cocktails made from scratch, with in-house syrups and fresh citrus daily.</p>
            </div>
            <div className="card">
              <h3>Local Producers</h3>
              <p>Wine and beer sourced from small NSW and Inner West makers.</p>
            </div>
            <div className="card">
              <h3>Considered Space</h3>
              <p>A room designed for conversation — low light, warm materials, no rush.</p>
            </div>
            <div className="card">
              <h3>Private Events</h3>
              <p>A semi-private area available for functions, celebrations, and group nights.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section cta-band">
        <div className="container cta-band-inner">
          <div>
            <h2>Come say hello</h2>
            <p>We're open Tuesday to Sunday from 4pm — walk-ins welcome, tables recommended.</p>
          </div>
          <Link to="/book" className="btn btn-primary">
            Book a Table
          </Link>
        </div>
      </section>
    </>
  )
}

export default About
