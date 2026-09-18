import { useEffect, useRef, useState } from 'react'
import api, { API_ORIGIN } from '../lib/api'
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

function validateFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Please choose a PDF, JPG, or PNG file.'
  if (file.size > MAX_SIZE_BYTES) return 'That file is larger than the 20MB limit.'
  return ''
}

function MenuPanel() {
  const [version, setVersion] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [mutating, setMutating] = useState(false)

  const [addFormOpen, setAddFormOpen] = useState(false)
  const [addFile, setAddFile] = useState(null)
  const [addTitle, setAddTitle] = useState('')
  const [addFileError, setAddFileError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteVersionTarget, setDeleteVersionTarget] = useState(null)
  const [versionMessage, setVersionMessage] = useState('')

  const replaceInputRef = useRef(null)
  const replaceTargetId = useRef(null)

  // "small success message" -- shown briefly, then clears itself rather
  // than sitting there until the next unrelated action happens to replace it.
  useEffect(() => {
    if (!versionMessage) return undefined
    const timer = setTimeout(() => setVersionMessage(''), 4000)
    return () => clearTimeout(timer)
  }, [versionMessage])

  const loadMenu = () =>
    api
      .getAdminMenuList()
      .then((data) => {
        setVersion(data.version)
        setHistory(data.history)
        setLoadError('')
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false))

  useEffect(() => {
    loadMenu()
  }, [])

  const pages = version?.pages ?? []

  const resetAddForm = () => {
    setAddFormOpen(false)
    setAddFile(null)
    setAddTitle('')
    setAddFileError('')
  }

  const handleAddFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const error = validateFile(file)
    setAddFileError(error)
    setAddFile(error ? null : file)
  }

  const handleAddPageSubmit = async () => {
    if (!addFile) return

    setActionError('')
    setMutating(true)

    try {
      await api.addMenuPage(addFile, addTitle.trim())
      resetAddForm()
      await loadMenu()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setMutating(false)
    }
  }

  const startReplace = (pageId) => {
    replaceTargetId.current = pageId
    replaceInputRef.current?.click()
  }

  const handleReplaceFileChosen = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const error = validateFile(file)
    if (error) {
      setActionError(error)
      return
    }

    setActionError('')
    setMutating(true)

    try {
      await api.replaceMenuPage(replaceTargetId.current, file)
      await loadMenu()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setMutating(false)
    }
  }

  const movePage = async (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= pages.length) return

    const reordered = [...pages]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)

    setActionError('')
    setMutating(true)

    try {
      await api.reorderMenuPages(reordered.map((page) => page.id))
      await loadMenu()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setMutating(false)
    }
  }

  const handleDeleteConfirm = async () => {
    await api.deleteMenuPage(deleteTarget.id)
    setDeleteTarget(null)
    await loadMenu()
  }

  // On failure this throws back into ConfirmDialog, which shows the error
  // inline and keeps the dialog (and the version underneath it) exactly
  // where it was -- history is only touched once the delete has actually
  // succeeded, never optimistically.
  const handleDeleteVersionConfirm = async () => {
    await api.deleteMenuVersion(deleteVersionTarget.id)
    setHistory((current) => current.filter((historyVersion) => historyVersion.id !== deleteVersionTarget.id))
    setDeleteVersionTarget(null)
    setVersionMessage('Previous menu version deleted.')
  }

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
        <Alert type="error" title="Could not update menu">
          {actionError}
        </Alert>
      )}

      <div className="card card-raised admin-menu-current">
        <h3>Current published menu</h3>

        {pages.length > 0 ? (
          <ul className="admin-menu-pages-list">
            {pages.map((page, index) => (
              <li key={page.id} className="admin-menu-page-row">
                <div className="admin-menu-page-info">
                  <span className="admin-menu-page-heading">
                    Page {page.sortOrder} — {page.title}
                  </span>
                  <span className="field-hint">{page.fileName}</span>
                </div>
                <div className="admin-menu-page-actions">
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`${API_ORIGIN}${page.url}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview
                  </a>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={mutating}
                    onClick={() => startReplace(page.id)}
                  >
                    Replace Page
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={mutating || index === 0}
                    onClick={() => movePage(index, index - 1)}
                  >
                    Move Up
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={mutating || index === pages.length - 1}
                    onClick={() => movePage(index, index + 1)}
                  >
                    Move Down
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-outline btn-sm"
                    disabled={mutating}
                    onClick={() => setDeleteTarget(page)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState label="No menu has been published yet." />
        )}

        <input
          type="file"
          ref={replaceInputRef}
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleReplaceFileChosen}
          className="visually-hidden"
        />
      </div>

      <div className="card card-raised admin-menu-upload">
        <h3>Add a menu page</h3>
        <p className="field-hint">
          Accepted formats: PDF, JPG, or PNG. Maximum 20MB. A new page is added to the end of the
          menu — existing pages are never replaced.
        </p>

        {!addFormOpen ? (
          <button type="button" className="btn btn-secondary" onClick={() => setAddFormOpen(true)}>
            + Add Menu Page
          </button>
        ) : (
          <div className="admin-menu-add-form">
            <label className="btn btn-secondary admin-menu-file-btn">
              Choose File
              <input
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                onChange={handleAddFileChange}
                className="visually-hidden"
              />
            </label>

            {addFileError && <p className="admin-menu-file-error">{addFileError}</p>}

            {addFile && (
              <div className="admin-menu-file-preview">
                <div>
                  <span className="admin-detail-label">Selected file</span>
                  <span>{addFile.name}</span>
                </div>
                <div>
                  <span className="admin-detail-label">Size</span>
                  <span>{formatFileSize(addFile.size)}</span>
                </div>
                <div className="field admin-menu-title-field">
                  <label htmlFor="admin-menu-add-title">Title (optional)</label>
                  <input
                    id="admin-menu-add-title"
                    type="text"
                    value={addTitle}
                    onChange={(event) => setAddTitle(event.target.value)}
                    placeholder="e.g. Wine"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleAddPageSubmit}
                  disabled={mutating}
                >
                  Add Page
                </button>
              </div>
            )}

            <button type="button" className="btn btn-ghost btn-sm admin-menu-cancel-add" onClick={resetAddForm}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {(history.length > 0 || versionMessage) && (
        <div className="card admin-menu-history">
          <h3>Previous versions</h3>

          {versionMessage && <Alert type="success">{versionMessage}</Alert>}

          {history.length > 0 && (
            <ul className="admin-menu-history-list">
              {history.map((historyVersion) => (
                <li key={historyVersion.id}>
                  <div className="admin-menu-history-info">
                    <span>{formatDateTime(historyVersion.publishedAt || historyVersion.createdAt)}</span>
                    <span className="field-hint">
                      {historyVersion.pages.length} page{historyVersion.pages.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="admin-menu-history-actions">
                    {historyVersion.pages[0] && (
                      <a
                        className="btn btn-ghost btn-sm"
                        href={`${API_ORIGIN}${historyVersion.pages[0].url}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      onClick={() => setDeleteVersionTarget(historyVersion)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Remove "${deleteTarget.title}" from this menu?`}
          description="This page will no longer appear on the public menu. The uploaded file itself isn't deleted."
          confirmLabel="Delete Page"
          danger
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {deleteVersionTarget && (
        <ConfirmDialog
          title="Delete this previous menu version?"
          description="This permanently removes it from your menu history. Its file is only removed from storage if no other menu version still uses it."
          confirmLabel="Delete Version"
          danger
          onConfirm={handleDeleteVersionConfirm}
          onClose={() => setDeleteVersionTarget(null)}
        />
      )}
    </div>
  )
}

export default MenuPanel
