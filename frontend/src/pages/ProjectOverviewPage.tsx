import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { HealthBadge } from '../components/HealthBadge'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { ApiError, apiFetch } from '../lib/api'
import type { CostIntelligence, Issue, MemoryEntry, MonitorStatus, ProjectDetail } from '../lib/types'

interface ActivityEvent {
  timestamp: string
  icon: string
  label: string
}

// Composed entirely from data the other tabs already fetch (issues, CEO
// review history in Project Memory) -- no fabricated "what happened" text,
// same anti-fabrication standard as FixEngineReplay and the demo data.
function buildActivityFeed(issues: Issue[], memory: MemoryEntry[]): ActivityEvent[] {
  const issueEvents: ActivityEvent[] = issues.map((issue) => {
    const pending = !issue.fix_applied && !issue.dismissed && issue.proposed_fix_description !== null
    if (issue.dismissed) {
      return { timestamp: issue.detected_at, icon: '⚪', label: `Dismissed: ${issue.type.replace(/_/g, ' ')}` }
    }
    if (pending) {
      return { timestamp: issue.detected_at, icon: '⚠️', label: `${issue.severity} ${issue.type.replace(/_/g, ' ')} detected -- awaiting your approval` }
    }
    if (issue.fix_applied && issue.verified) {
      return { timestamp: issue.detected_at, icon: '✅', label: `${issue.type.replace(/_/g, ' ')} detected -- fixed automatically` }
    }
    return { timestamp: issue.detected_at, icon: '🔴', label: `${issue.severity} ${issue.type.replace(/_/g, ' ')} detected` }
  })

  const reviewEvents: ActivityEvent[] = memory
    .filter((entry) => entry.decision_type === 'ceo_review')
    .map((entry) => ({
      timestamp: entry.timestamp,
      icon: entry.content.includes('APPROVED') ? '✅' : '⚠️',
      label: entry.content.includes('APPROVED') ? 'CEO Review passed' : 'CEO Review found issues',
    }))

  return [...issueEvents, ...reviewEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10)
}

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [memory, setMemory] = useState<MemoryEntry[] | null>(null)
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null)
  const [cost, setCost] = useState<CostIntelligence | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    apiFetch<ProjectDetail>(`/api/v1/projects/${projectId}`).then(setProject).catch((err: ApiError) => setError(err.message))
    apiFetch<Issue[]>(`/api/v1/projects/${projectId}/issues`).then(setIssues).catch((err: ApiError) => setError(err.message))
    apiFetch<MemoryEntry[]>(`/api/v1/projects/${projectId}/memory`).then(setMemory).catch(() => setMemory([]))
    apiFetch<{ jobs: MonitorStatus }>(`/api/v1/monitor/status?project_id=${projectId}`)
      .then((r) => setMonitorStatus(r.jobs))
      .catch(() => {})
    apiFetch<CostIntelligence>(`/api/v1/monitor/cost?project_id=${projectId}`).then(setCost).catch(() => {})
  }, [projectId])

  if (!projectId) return null

  const openIssuesCount = issues?.filter((i) => !i.dismissed && !(i.fix_applied && i.verified)).length ?? null
  const anyTrackRunning = monitorStatus ? Object.values(monitorStatus).some((j) => j.running) : null
  const activity = issues && memory ? buildActivityFeed(issues, memory) : null

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      {error && <ErrorBanner message={error} />}

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BentoCard>
          <p className="text-xs uppercase tracking-wide text-ink-faint">Health</p>
          <div className="mt-3">{project ? <HealthBadge status={project.health} /> : <Spinner />}</div>
        </BentoCard>
        <BentoCard>
          <p className="text-xs uppercase tracking-wide text-ink-faint">Open issues</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-ink">{openIssuesCount ?? '...'}</p>
        </BentoCard>
        <BentoCard>
          <p className="text-xs uppercase tracking-wide text-ink-faint">Monitoring</p>
          <p className="mt-2 text-sm text-ink">{anyTrackRunning === null ? '...' : anyTrackRunning ? 'Active' : 'Paused'}</p>
        </BentoCard>
        <BentoCard>
          <p className="text-xs uppercase tracking-wide text-ink-faint">Cost this month</p>
          <p className="mt-2 font-mono text-sm text-ink">
            {cost === null
              ? '...'
              : cost.budget_usd !== null
                ? `$${cost.total_cost_usd.toFixed(2)} / $${cost.budget_usd.toFixed(2)}`
                : `$${cost.total_cost_usd.toFixed(2)} (no budget set)`}
          </p>
        </BentoCard>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-ink-dim">Recent activity</h2>
      {activity === null ? (
        <Spinner label="Loading activity..." />
      ) : activity.length === 0 ? (
        <p className="text-ink-faint">No activity recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {activity.map((event, i) => (
            <BentoCard key={`${event.timestamp}-${i}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">
                  {event.icon} {event.label}
                </span>
                <span className="whitespace-nowrap text-xs text-ink-faint">{new Date(event.timestamp).toLocaleString()}</span>
              </div>
            </BentoCard>
          ))}
        </div>
      )}
    </div>
  )
}
