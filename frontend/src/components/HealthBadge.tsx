import type { HealthStatus } from '../lib/types'

const STYLES: Record<HealthStatus, string> = {
  green: 'bg-green-100 text-green-800 border-green-300',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  red: 'bg-red-100 text-red-800 border-red-300',
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
