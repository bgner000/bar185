import { Link } from 'react-router-dom'

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-identity">
        <div>
          <p className="brand footer-brand">
            Bar <span>185</span>
          </p>
          <p className="footer-location">185 Illawarra Road, Marrickville NSW 2204</p>
        </div>

        <p className="footer-hours">
          Tuesday – Sunday
          <span>4pm till late</span>
        </p>
      </div>

      <div className="container footer-grid">
        <nav aria-label="Footer">
          <h4>Explore</h4>
          <ul className="footer-links footer-links--inline">
            <li><Link to="/menu">Menu</Link></li>
            <li><Link to="/events">Events</Link></li>
            <li><Link to="/about">About</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li><Link to="/book">Book a Table</Link></li>
          </ul>
        </nav>

        <p className="footer-email">hello@bar185.com.au</p>
      </div>

      <div className="container footer-bottom">
        <p>&copy; {new Date().getFullYear()} Bar 185. All rights reserved.</p>
      </div>
    </footer>
  )
}

export default Footer
