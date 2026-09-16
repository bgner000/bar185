import { useEffect, useState } from 'react'
import SectionHead from '../components/SectionHead'
import PdfViewer from '../components/PdfViewer'
import { LoadingState, EmptyState, Alert } from '../components/Feedback'
import api, { API_ORIGIN } from '../lib/api'

function Menu() {
  const [menu, setMenu] = useState(undefined) // undefined = loading, null = none published
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getPublicMenu()
      .then((data) => setMenu(data.menu))
      .catch(() => setError('Could not load the menu right now. Please try again shortly.'))
  }, [])

  const menuUrl = menu ? `${API_ORIGIN}${menu.url}` : null
  const isImage = menu?.mimeType?.startsWith('image/')

  return (
    <section className="section">
      <div className="container narrow">
        <SectionHead eyebrow="Menu" title="Our Menu" center>
          Cocktails, wine, beer, and small plates — updated by our team as the season changes.
        </SectionHead>

        {error && <Alert type="error">{error}</Alert>}

        {menu === undefined && !error && <LoadingState label="Loading menu…" />}

        {menu === null && !error && (
          <EmptyState label="Our menu will be published here shortly — please check back soon." />
        )}

        {menu && (
          <div className="menu-viewer-wrap">
            {isImage ? (
              <div className="pdf-viewer">
                <img src={menuUrl} alt="Bar 185 menu" className="menu-image" />
                <div className="pdf-viewer-links">
                  <a href={menuUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                    Open Full Size
                  </a>
                  <a href={menuUrl} download={menu.fileName} className="btn btn-ghost btn-sm">
                    Download
                  </a>
                </div>
              </div>
            ) : (
              <PdfViewer url={menuUrl} fileName={menu.fileName} />
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default Menu
