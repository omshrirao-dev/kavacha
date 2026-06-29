import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BentoCard } from '../components/ui/BentoCard'
import { CountUp } from '../components/ui/CountUp'
import { HealthBadge } from '../components/HealthBadge'
import { ErrorBanner } from '../components/ErrorBanner'
import { Spinner } from '../components/Spinner'
import { SkeletonCard } from '../components/ui/SkeletonCard'
import { ApiError, apiFetch } from '../lib/api'
import type { CostIntelligence, DashboardSummary, Issue, Project } from '../lib/types'

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

// Each card fetches its own issues/cost so the project list renders
// immediately and per-card detail streams in -- same stale-while-revalidate
// spirit as ProjectHeader's cache, just without a cache since this is a
// one-time mount per card, not something switched between repeatedly.
function ProjectCard({ project }: { project: Project }) {
  const [openIssues, setOpenIssues] = useState<number | null>(null)
  const [cost, setCost] = useState<CostIntelligence | null>(null)

  useEffect(() => {
    apiFetch<Issue[]>(`/api/v1/projects/${project.id}/issues`)
      .then((issues) => setOpenIssues(issues.filter((i) => !i.dismissed && !(i.fix_applied && i.verified)).length))
      .catch(() => setOpenIssues(null))
    apiFetch<CostIntelligence>(`/api/v1/monitor/cost?project_id=${project.id}`)
      .then(setCost)
      .catch(() => setCost(null))
  }, [project.id])

  return (
    <BentoCard>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-ink">{project.name}</p>
        <HealthBadge status={project.health} />
      </div>
      <p className="mt-1 text-xs text-ink-faint">Created {new Date(project.created_at).toLocaleDateString()}</p>
      <p className="mt-3 text-sm text-ink-dim">{openIssues === null ? 'Issues: ...' : `Issues: ${openIssues} open`}</p>
      <p className="text-sm text-ink-dim">
        {cost === null
          ? 'Budget: ...'
          : cost.budget_usd !== null
            ? `Budget: $${cost.total_cost_usd.toFixed(2)} / $${cost.budget_usd.toFixed(2)} projected`
            : 'Budget: not set'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Link
          to={`/projects/${project.id}/overview`}
          className="rounded-md border border-edge px-2.5 py-1 text-ink-dim hover:border-saffron-bright hover:text-ink"
        >
          View Details
        </Link>
        <Link
          to={`/projects/${project.id}/monitor`}
          className="rounded-md border border-edge px-2.5 py-1 text-ink-dim hover:border-saffron-bright hover:text-ink"
        >
          Monitor
        </Link>
        <Link
          to={`/projects/${project.id}/review`}
          className="rounded-md border border-edge px-2.5 py-1 text-ink-dim hover:border-saffron-bright hover:text-ink"
        >
          CEO Review
        </Link>
      </div>
    </BentoCard>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-edge bg-card p-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full gradient-bg text-2xl">🛡️</div>
      <p className="font-medium text-ink">Your first AI project is waiting to be monitored</p>
      <p className="mt-1 text-sm text-ink-dim">Connect it and Kavacha starts watching immediately.</p>
      <Link
        to="/projects/new"
        className="mt-5 inline-block rounded-md gradient-bg px-5 py-2.5 text-sm font-semibold text-surface shadow-[0_0_24px_-4px_var(--saffron-glow)]"
      >
        Add it in 60 seconds →
      </Link>
    </div>
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
  if (!projects) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <Link to="/projects/new" className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-surface">
          + Add New Project
        </Link>
      </div>

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
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}
