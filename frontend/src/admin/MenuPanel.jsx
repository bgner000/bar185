import { useEffect, useState } from 'react'
import api from '../lib/api'
import ConfirmDialog from '../components/ConfirmDialog'
import { Alert, LoadingState, EmptyState } from '../components/Feedback'
import { formatDateTime } from '../lib/format'

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE_BYTES = 20 * 1024 * 1024

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function MenuPanel() {
  const [documents, setDocuments] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const loadDocuments = () =>
    api
      .getAdminMenuList()
      .then((data) => {
        setDocuments(data.documents)
        setLoadError('')
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false))

  useEffect(() => {
    loadDocuments()
  }, [])

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    setActionError('')
    setFileError('')

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError('Please choose a PDF, JPG, or PNG file.')
      setPendingFile(null)
      return
    }

    if (file.size > MAX_SIZE_BYTES) {
      setFileError('That file is larger than the 20MB limit.')
      setPendingFile(null)
      return
    }

    setPendingFile(file)
  }

  const handlePublish = async () => {
    await api.uploadMenu(pendingFile)
    setPendingFile(null)
    setConfirmOpen(false)
    await loadDocuments()
  }

  const active = documents?.find((doc) => doc.is_active)
  const history = documents?.filter((doc) => !doc.is_active) ?? []

  if (loading) {
    return <LoadingState label="Loading menu…" />
  }

  if (loadError) {
    return (
      <Alert type="error" title="Could not load menu">
        {loadError}
      </Alert>
    )
  }

  return (
    <div>
      <h2 className="admin-section-title">Menu</h2>

      {actionError && (
        <Alert type="error" title="Could not publish menu">
          {actionError}
        </Alert>
      )}

      <div className="card card-raised admin-menu-current">
        <h3>Current published menu</h3>

        {active ? (
          <div className="admin-menu-current-details">
            <span className="badge badge-success">Published</span>
            <div>
              <span className="admin-detail-label">File name</span>
              <span>{active.file_name}</span>
            </div>
            <div>
              <span className="admin-detail-label">Uploaded</span>
              <span>{formatDateTime(active.created_at)}</span>
            </div>
            <div>
              <span className="admin-detail-label">Uploaded by</span>
              <span>{active.uploaded_by_name || 'Unknown'}</span>
            </div>
            <a className="btn btn-secondary btn-sm" href={active.url} target="_blank" rel="noreferrer">
              Preview current menu
            </a>
          </div>
        ) : (
          <EmptyState label="No menu has been published yet." />
        )}
      </div>

      <div className="card card-raised admin-menu-upload">
        <h3>Upload / Replace Menu</h3>
        <p className="field-hint">Accepted formats: PDF, JPG, or PNG. Maximum 20MB.</p>

        <label className="btn btn-secondary admin-menu-file-btn">
          Choose File
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            onChange={handleFileChange}
            className="visually-hidden"
          />
        </label>

        {fileError && <p className="admin-menu-file-error">{fileError}</p>}

        {pendingFile && (
          <div className="admin-menu-file-preview">
            <div>
              <span className="admin-detail-label">Selected file</span>
              <span>{pendingFile.name}</span>
            </div>
            <div>
              <span className="admin-detail-label">Size</span>
              <span>{formatFileSize(pendingFile.size)}</span>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirmOpen(true)}>
              Publish / Replace Menu
            </button>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="card admin-menu-history">
          <h3>Previous versions</h3>
          <ul className="admin-menu-history-list">
            {history.map((doc) => (
              <li key={doc.id}>
                <span>{doc.file_name}</span>
                <span className="field-hint">{formatDateTime(doc.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmOpen && pendingFile && (
        <ConfirmDialog
          title="Replace the currently published menu?"
          description="This immediately becomes the live public menu — no rebuild or deploy needed."
          confirmLabel="Replace Menu"
          onConfirm={handlePublish}
          onClose={() => setConfirmOpen(false)}
        >
          <dl className="modal-detail-list">
            <div>
              <span>New file</span>
              <span>{pendingFile.name}</span>
            </div>
            <div>
              <span>Size</span>
              <span>{formatFileSize(pendingFile.size)}</span>
            </div>
            {active && (
              <div>
                <span>Replacing</span>
                <span>{active.file_name}</span>
              </div>
            )}
          </dl>
        </ConfirmDialog>
      )}
    </div>
  )
}

export default MenuPanel
