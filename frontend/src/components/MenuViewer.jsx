import { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { LoadingState } from './Feedback'

// pdf.js needs its worker script's URL; this is the standard Vite pattern so
// the worker gets bundled/served correctly rather than fetched from a CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href

// The published menu is an ordered list of uploaded pages (one per
// menu_pages row), but any of those pages can itself be a PDF containing
// several internal pages (e.g. one file with a cocktails page and a food
// page inside it). The public viewer flattens both levels into a single
// "Page X of Y" sequence: an uploaded 1-page PDF plus a 2-page PDF reads
// exactly the same as three separate 1-page uploads, and a normal
// multi-page PDF's pages are never hidden behind the first one.
function MenuViewer({ pages }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [slots, setSlots] = useState(null) // null = loading
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState('')
  const [resizeTick, setResizeTick] = useState(0)

  const pagesKey = useMemo(() => pages.map((page) => page.url).join('|'), [pages])

  useEffect(() => {
    let cancelled = false

    setSlots(null)
    setError('')
    setCurrentIndex(0)

    Promise.all(
      pages.map(async (page) => {
        if (!page.mimeType?.startsWith('application/pdf') && page.mimeType !== 'application/pdf') {
          // Any image type (jpg/png) is exactly one slot.
          return [{ page, pdfDoc: null, pdfPageNumber: null }]
        }

        const doc = await pdfjsLib.getDocument({ url: page.url }).promise

        return Array.from({ length: doc.numPages }, (_, index) => ({
          page,
          pdfDoc: doc,
          pdfPageNumber: index + 1,
        }))
      })
    )
      .then((groups) => {
        if (cancelled) return
        setSlots(groups.flat())
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the menu.')
      })

    return () => {
      cancelled = true
    }
    // pagesKey captures every url in `pages`; re-running only when the actual
    // published content changes (not on every unrelated parent re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesKey])

  useEffect(() => {
    const handleResize = () => setResizeTick((tick) => tick + 1)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const currentSlot = slots?.[currentIndex] || null
  const isImageSlot = currentSlot && !currentSlot.pdfDoc

  useEffect(() => {
    if (!currentSlot || isImageSlot || !canvasRef.current || !containerRef.current) return

    let cancelled = false

    currentSlot.pdfDoc.getPage(currentSlot.pdfPageNumber).then((page) => {
      if (cancelled) return

      const containerWidth = containerRef.current.clientWidth
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2.2, containerWidth / baseViewport.width)
      const viewport = page.getViewport({ scale })

      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height

      const context = canvas.getContext('2d')
      page.render({ canvasContext: context, viewport })
    })

    return () => {
      cancelled = true
    }
  }, [currentSlot, isImageSlot, resizeTick])

  if (error) {
    return <p className="field-hint">{error}</p>
  }

  if (!slots) {
    return <LoadingState label="Loading menu…" />
  }

  const numSlots = slots.length

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {isImageSlot ? (
        <img src={currentSlot.page.url} alt={currentSlot.page.title || 'Bar 185 menu'} className="menu-image" />
      ) : (
        <canvas ref={canvasRef} className="pdf-viewer-canvas" />
      )}

      <div className="pdf-viewer-controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={currentIndex <= 0}
          onClick={() => setCurrentIndex((n) => n - 1)}
        >
          ‹ Previous
        </button>

        <span className="pdf-viewer-page-count">
          Page {currentIndex + 1} of {numSlots}
        </span>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={currentIndex >= numSlots - 1}
          onClick={() => setCurrentIndex((n) => n + 1)}
        >
          Next ›
        </button>
      </div>

      {currentSlot && (
        <div className="pdf-viewer-links">
          <a href={currentSlot.page.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            Open {isImageSlot ? 'Full Size' : 'PDF'}
          </a>
          <a href={currentSlot.page.url} download={currentSlot.page.fileName} className="btn btn-ghost btn-sm">
            Download
          </a>
        </div>
      )}
    </div>
  )
}

export default MenuViewer
