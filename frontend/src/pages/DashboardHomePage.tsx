import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BentoCard } from '../components/ui/BentoCard'
import { CountUp } from '../components/ui/CountUp'
import { HealthBadge } from '../components/HealthBadge'
import { ErrorBanner } from '../components/ErrorBanner'
import { Spinner } from '../components/Spinner'
import { ApiError, apiFetch } from '../lib/api'
import type { DashboardSummary, Project } from '../lib/types'

function HealthOverview({ projects }: { projects: Project[] }) {
  const counts = { green: 0, yellow: 0, red: 0 }
  for (const p of projects) counts[p.health]++
  const overall = counts.red > 0 ? 'red' : counts.yellow > 0 ? 'yellow' : 'green'
  const MESSAGE = {
    green: 'Everything is okay.',
    yellow: 'Mostly fine -- a few things need attention.',
    red: 'Something needs your attention right now.',
  }[overall]

  return (
    <div className={`mb-8 flex items-center gap-4 rounded-xl border border-edge bg-card p-6 ${overall === 'green' ? 'gradient-glow-ok' : ''}`}>
      <HealthBadge status={overall} />
      <div>
        <p className="font-medium text-ink">{MESSAGE}</p>
        <p className="text-sm text-ink-dim">
          {counts.green} healthy &middot; {counts.yellow} warning &middot; {counts.red} critical
        </p>
      </div>
    </div>
  )
}

function MetricCard({ label, value, suffix, accent }: { label: string; value: number; suffix?: string; accent?: boolean }) {
  return (
    <BentoCard>
      <p className="text-xs uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-semibold ${accent ? 'text-saffron-bright' : 'text-ink'}`}>
        <CountUp value={value} />
        {suffix}
      </p>
    </BentoCard>
  )
}

export function DashboardHomePage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Project[]>('/api/v1/projects').then(setProjects).catch((err: ApiError) => setError(err.message))
    apiFetch<DashboardSummary>('/api/v1/dashboard/summary')
      .then(setSummary)
      .catch((err: ApiError) => setSummaryError(err.message))
  }, [])

  if (error) return <ErrorBanner message={`Failed to load projects: ${error}`} />
  if (!projects) return <Spinner label="Loading dashboard..." />

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Dashboard</h1>

      {projects.length > 0 && <HealthOverview projects={projects} />}

      <div className="mb-10">
        {summary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Projects monitored" value={summary.projects_monitored} accent />
            <MetricCard label="Issues caught today" value={summary.issues_today} />
            <MetricCard
              label="Fixes applied"
              value={summary.fixes_applied}
              suffix={summary.fix_success_rate !== null ? ` (${Math.round(summary.fix_success_rate * 100)}%)` : ''}
            />
            <MetricCard label="Patterns learned" value={summary.patterns_learned} accent />
            <MetricCard label="Cost overruns caught" value={summary.cost_overruns_caught} />
            <MetricCard label="Compliance reports" value={summary.compliance_reports_ready} />
          </div>
        ) : summaryError ? (
          <ErrorBanner message={`Failed to load metrics: ${summaryError}`} />
        ) : (
          <Spinner label="Loading metrics..." />
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-ink-dim">Your projects</h2>
      {projects.length === 0 ? (
        <p className="text-ink-faint">No projects yet.</p>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}/memory`}
              className="flex items-center justify-between rounded-lg border border-edge bg-card p-4 transition-colors hover:border-saffron/40"
            >
              <div>
                <p className="font-medium text-ink">{p.name}</p>
                <p className="text-xs text-ink-faint">{new Date(p.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-ink-dim">{p.status}</span>
                <HealthBadge status={p.health} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
