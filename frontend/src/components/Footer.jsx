import { Link } from 'react-router-dom'

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <p className="brand footer-brand">
            Bar <span>185</span>
          </p>
          <p>A bar and private events venue in Marrickville, Inner West Sydney.</p>
        </div>

        <div>
          <h4>Explore</h4>
          <ul className="footer-links">
            <li><Link to="/menu">Menu</Link></li>
            <li><Link to="/events">Events</Link></li>
            <li><Link to="/about">About</Link></li>
            <li><Link to="/book">Book a Table</Link></li>
          </ul>
        </div>

        <div>
          <h4>Visit</h4>
          <p>185 Illawarra Road<br />Marrickville NSW 2204</p>
          <p>Tue–Sun, 4pm till late</p>
        </div>

        <div>
          <h4>Contact</h4>
          <p>
            <Link to="/contact">Get in touch</Link>
          </p>
          <p>hello@bar185.com.au</p>
        </div>
      </div>

      <div className="container footer-bottom">
        <p>&copy; {new Date().getFullYear()} Bar 185. All rights reserved.</p>
      </div>
    </footer>
  )
}

export default Footer
