import { Link } from 'react-router-dom'
import VenueImage from '../components/VenueImage'
import { venueImages } from '../data/venueImages'

function About() {
  return (
    <>
      <section className="section">
        <div className="container editorial-split">
          <VenueImage image={venueImages.exteriorSign} className="editorial-split-photo about-sign-photo" loading="eager" />

          <div className="editorial-split-text">
            <h1>Bar 185</h1>
            <p>
              A neighbourhood bar in Marrickville, built around good drinks, local produce, and
              unhurried evenings.
            </p>
            <p>
              Bar 185 opened with a simple idea: a bar the Inner West could make its own. We keep
              the drinks list tight and considered, lean on producers from around NSW, and treat
              the small plates menu with the same care as the cocktails.
            </p>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="container editorial-split editorial-split--reverse">
          <div className="editorial-split-text">
            <p>
              Whether you&rsquo;re in for a quick glass of wine after work or settling in for a
              long night with friends, the room is built to feel the same — warm, a little dim,
              and never rushed. It&rsquo;s the kind of place where the bartenders know the
              regulars and the regulars bring their friends.
            </p>
            <Link to="/contact" className="link-editorial">
              Find us <span className="arrow">→</span>
            </Link>
          </div>

          <VenueImage
            image={venueImages.mainBarFront}
            className="editorial-split-photo editorial-split-photo--overlap"
          />
        </div>
      </section>

      <section className="section">
        <div className="container principles">
          <div>
            <h2>A considered space</h2>
            <p>
              A room designed for conversation — low light, warm materials, and no rush.
              Everything else at Bar 185 follows from that.
            </p>
          </div>

          <div>
            <div className="contact-details-block">
              <h3>Handcrafted</h3>
              <p>Cocktails made from scratch, with in-house syrups and fresh citrus daily.</p>
            </div>
            <div className="contact-details-block">
              <h3>Local Producers</h3>
              <p>Wine and beer sourced from small NSW and Inner West makers.</p>
            </div>
            <div className="contact-details-block">
              <h3>Private Events</h3>
              <p>A semi-private area available for functions, celebrations, and group nights.</p>
            </div>
          </div>
        </div>
      </section>

      <VenueImage image={venueImages.mainBarFront} className="about-banner-photo" />

      <section className="section section-dark">
        <div className="container">
          <h2 className="display">Come say hello.</h2>
          <p className="lede lede--tight">
            We&rsquo;re open Tuesday to Sunday from 4pm — walk-ins welcome, tables recommended.
          </p>
          <Link to="/book" className="btn btn-primary">
            Book a Table
          </Link>
        </div>
      </section>
    </>
  )
}

export default About
