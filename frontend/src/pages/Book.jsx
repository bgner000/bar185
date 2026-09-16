import { useState } from 'react'
import SectionHead from '../components/SectionHead'
import BookingForm from '../components/BookingForm'
import EventEnquiryForm from '../components/EventEnquiryForm'
import CancelBookingForm from '../components/CancelBookingForm'
import VenueImage from '../components/VenueImage'
import { venueImages } from '../data/venueImages'

function Book() {
  const [tab, setTab] = useState('table') // table | event

  return (
    <>
      <VenueImage
        image={venueImages.interiorNight}
        className="book-banner-photo"
        objectPosition="50% 40%"
        loading="eager"
      />

      <section className="section">
        <div className="container narrow">
          <SectionHead eyebrow="Book" title="Reserve Your Visit" center>
            Book a table for up to 8 guests instantly, or send an enquiry for larger groups and
            private events.
          </SectionHead>

          <div className="menu-tabs book-tabs" role="tablist" aria-label="Booking type">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'table'}
              className={`menu-tab${tab === 'table' ? ' active' : ''}`}
              onClick={() => setTab('table')}
            >
              Book a Table
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'event'}
              className={`menu-tab${tab === 'event' ? ' active' : ''}`}
              onClick={() => setTab('event')}
            >
              Private Event / Enquiry
            </button>
          </div>

          <div className="book-panel">
            {tab === 'table' ? <BookingForm /> : <EventEnquiryForm />}
          </div>

          <CancelBookingForm />
        </div>
      </section>
    </>
  )
}

export default Book
