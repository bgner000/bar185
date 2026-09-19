import { useState } from 'react'
import BookingForm from '../components/BookingForm'
import EventEnquiryForm from '../components/EventEnquiryForm'
import CancelBookingForm from '../components/CancelBookingForm'
import VenueImage from '../components/VenueImage'
import { venueImages } from '../data/venueImages'

function Book() {
  const [tab, setTab] = useState('table') // table | event

  return (
    <section className="section">
      <div className="container narrow">
        <div className="book-layout">
          <div>
            <h1>Reserve Your Visit</h1>
            <p className="lede">
              Book a table for up to 8 guests instantly, or send an enquiry for larger groups and
              private events.
            </p>

            <VenueImage image={venueImages.interiorNight} className="book-intro-photo" objectPosition="50% 40%" />

            <div className="book-intro-detail">
              <h3>185 Illawarra Road, Marrickville</h3>
              <p>Tuesday – Sunday, 4pm till late. Walk-ins welcome, tables recommended.</p>
            </div>
          </div>

          <div>
            <div className="booking-type-tabs book-tabs" role="tablist" aria-label="Booking type">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'table'}
                className={`booking-type-tab${tab === 'table' ? ' active' : ''}`}
                onClick={() => setTab('table')}
              >
                Book a Table
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'event'}
                className={`booking-type-tab${tab === 'event' ? ' active' : ''}`}
                onClick={() => setTab('event')}
              >
                Private Event / Enquiry
              </button>
            </div>

            <div className="book-panel">
              {tab === 'table' ? <BookingForm /> : <EventEnquiryForm />}
            </div>
          </div>
        </div>

        <div className="manage-booking-section">
          <span className="meta">Existing Booking</span>
          <CancelBookingForm />
        </div>
      </div>
    </section>
  )
}

export default Book
