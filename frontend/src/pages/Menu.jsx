import { useEffect, useState } from 'react'
import MenuViewer from '../components/MenuViewer'
import VenueImage from '../components/VenueImage'
import { LoadingState, EmptyState, Alert } from '../components/Feedback'
import api, { API_ORIGIN } from '../lib/api'
import { venueImages } from '../data/venueImages'

function Menu() {
  const [menu, setMenu] = useState(undefined) // undefined = loading, null = none published
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getPublicMenu()
      .then((data) => setMenu(data.menu))
      .catch(() => setError('Could not load the menu right now. Please try again shortly.'))
  }, [])

  const pages = menu?.pages.map((page) => ({ ...page, url: `${API_ORIGIN}${page.url}` })) ?? null

  return (
    <>
      <VenueImage
        image={venueImages.mainBarFront}
        className="menu-banner-photo"
        objectPosition="50% 35%"
        loading="eager"
      />

      <section className="section">
        <div className="container menu-page-container">
          <div className="section-head">
            <h1>Our Menu</h1>
            <p className="lede">
              Cocktails, wine, beer, and small plates — updated by our team as the season changes.
            </p>
          </div>

          <div className="menu-viewer-frame">
            {error && <Alert type="error">{error}</Alert>}

            {menu === undefined && !error && <LoadingState label="Loading menu…" />}

            {menu === null && !error && (
              <EmptyState label="Our menu will be published here shortly — please check back soon." />
            )}

            {menu && (
              <div className="menu-viewer-wrap">
                <MenuViewer pages={pages} />
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

export default Menu
