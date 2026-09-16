import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { LoadingState } from './Feedback'

// pdf.js needs its worker script's URL; this is the standard Vite pattern so
// the worker gets bundled/served correctly rather than fetched from a CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href

// Renders each page to a <canvas> ourselves (rather than relying on the
// browser's own, inconsistent-across-devices PDF plugin) so page navigation
// and sizing behave the same on desktop and mobile.
function PdfViewer({ url, fileName }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resizeTick, setResizeTick] = useState(0)

  useEffect(() => {
    let cancelled = false

    pdfjsLib
      .getDocument({ url })
      .promise.then((doc) => {
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setPageNum(1)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the menu PDF.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    const handleResize = () => setResizeTick((tick) => tick + 1)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return

    let cancelled = false

    pdfDoc.getPage(pageNum).then((page) => {
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
  }, [pdfDoc, pageNum, resizeTick])

  if (loading) {
    return <LoadingState label="Loading menu…" />
  }

  if (error) {
    return <p className="field-hint">{error}</p>
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      <canvas ref={canvasRef} className="pdf-viewer-canvas" />

      <div className="pdf-viewer-controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pageNum <= 1}
          onClick={() => setPageNum((n) => n - 1)}
        >
          ‹ Previous
        </button>

        <span className="pdf-viewer-page-count">
          Page {pageNum} of {numPages}
        </span>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pageNum >= numPages}
          onClick={() => setPageNum((n) => n + 1)}
        >
          Next ›
        </button>
      </div>

      <div className="pdf-viewer-links">
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
          Open PDF
        </a>
        <a href={url} download={fileName} className="btn btn-ghost btn-sm">
          Download PDF
        </a>
      </div>
    </div>
  )
}

export default PdfViewer
