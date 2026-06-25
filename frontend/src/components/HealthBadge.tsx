import type { HealthStatus } from '../lib/types'

const STYLES: Record<HealthStatus, string> = {
  green: 'bg-ok/10 text-ok border-ok/30',
  yellow: 'bg-warn/10 text-warn border-warn/30',
  red: 'bg-bad/10 text-bad border-bad/30',
}

const LABELS: Record<HealthStatus, string> = {
  green: 'Healthy',
  yellow: 'Warning',
  red: 'Critical',
}

export function HealthBadge({ status }: { status: HealthStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </span>
  )
}
