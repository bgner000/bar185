export function Alert({ type = 'info', title, children }) {
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <div>
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
      </div>
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state-block">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({ label = 'Nothing here yet.' }) {
  return (
    <div className="state-block">
      <p>{label}</p>
    </div>
  )
}
