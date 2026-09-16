import { statusLabel, statusTone } from '../lib/format'

function StatusBadge({ status }) {
  return <span className={`badge badge-${statusTone(status)}`}>{statusLabel(status)}</span>
}

export default StatusBadge
