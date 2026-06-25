import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BentoCard } from '../components/ui/BentoCard'
import { HealthBadge } from '../components/HealthBadge'
import { Spinner } from '../components/Spinner'
import type { DemoData } from '../lib/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-bad/10 text-bad',
  WARNING: 'bg-warn/10 text-warn',
  INFO: 'bg-saffron/10 text-saffron-bright',
  high: 'bg-bad/10 text-bad',
  medium: 'bg-warn/10 text-warn',
  low: 'bg-saffron/10 text-saffron-bright',
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mb-4 mt-1 text-sm text-ink-dim">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  )
}

export function DemoPage() {
  const [data, setData] = useState<DemoData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/demo`)
      .then((r) => {
        if (!r.ok) throw new Error('failed')
        return r.json()
      })
      .then(setData)
      .catch(() => setError(true))
  }, [])

  return (
    <div className="min-h-screen bg-surface">
      <div className="sticky top-0 z-10 border-b border-saffron/30 bg-saffron px-6 py-2 text-center text-sm font-medium text-surface">
        DEMO MODE -- fake but realistic data, read-only, nothing here can be changed.{' '}
        <Link to="/login" className="underline">
          Sign in to monitor a real project
        </Link>
      </div>

      <header className="border-b border-edge bg-surface-2">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold text-ink">
            Kavacha
          </Link>
          <Link to="/login" className="rounded-md border border-edge px-3 py-1.5 text-sm text-ink hover:border-saffron-bright">
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {error && <p className="text-bad">Couldn't load demo data. Try refreshing.</p>}
        {!data && !error && <Spinner label="Loading demo project..." />}

        {data && (
          <>
            <div className="mb-8 flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-ink">{data.project.name}</h1>
              <HealthBadge status={data.project.health} />
            </div>

            <Section title="Project Memory -- “We remember WHY”" subtitle="Every architectural decision, with the reasoning behind it.">
              <div className="space-y-3">
                {data.memory.map((m) => (
                  <BentoCard key={m.id}>
                    <div className="mb-2 flex gap-2 text-xs">
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-dim">{m.stage}</span>
                      {m.layer && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-dim">{m.layer}</span>}
                      <span className="ml-auto text-ink-faint">{m.source === 'human' ? 'logged via SDK' : 'AI-authored'}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-ink-dim">{m.content}</p>
                  </BentoCard>
                ))}
              </div>
            </Section>

            <Section title="Issues caught" subtitle="Detected by the Monitor Agent, diagnosed by the Fix Engine.">
              <div className="space-y-3">
                {data.issues.map((issue) => (
                  <BentoCard key={issue.id}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[issue.severity] ?? ''}`}>
                        {issue.severity}
                      </span>
                      <span className="text-xs text-ink-faint">{issue.type}</span>
                      <span className="ml-auto text-xs text-ink-faint">{new Date(issue.detected_at).toLocaleString()}</span>
                    </div>
                    <p className="mb-1 text-sm text-ink">{issue.description}</p>
                    {issue.root_cause && <p className="text-xs text-ink-dim">Root cause: {issue.root_cause}</p>}
                    <div className="mt-2 flex gap-3 text-xs text-ink-faint">
                      <span>{issue.fix_applied ? 'Fix applied' : 'No fix applied yet'}</span>
                      <span>{issue.verified ? 'Verified' : 'Unverified'}</span>
                      {issue.time_to_resolve_mins !== null && <span>Resolved in {issue.time_to_resolve_mins}m</span>}
                    </div>
                  </BentoCard>
                ))}
              </div>
            </Section>

            <Section title="CEO Review -- “Your toughest critic”" subtitle="The AI switches roles entirely and compares promise against delivery.">
              <BentoCard>
                <span
                  className={`mb-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                    data.ceo_review.approved ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad'
                  }`}
                >
                  {data.ceo_review.approved ? 'Approved' : 'Issues Found'}
                </span>
                <p className="mb-3 text-sm text-ink">{data.ceo_review.summary}</p>
                <ul className="space-y-2">
                  {data.ceo_review.issues.map((gap, i) => (
                    <li key={i} className="rounded border border-edge bg-surface-2 p-3 text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[gap.severity] ?? ''}`}>
                          {gap.severity}
                        </span>
                        <span className="font-medium text-ink-dim">{gap.requirement_reference}</span>
                      </div>
                      <p className="text-ink-dim">{gap.gap_description}</p>
                    </li>
                  ))}
                </ul>
              </BentoCard>
            </Section>

            <Section title="Cost Intelligence" subtitle="Real token cost, tracked against the budget approved in Stage 2.">
              <BentoCard className={data.cost_intelligence.over_budget ? 'border-bad/40' : ''}>
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-ink-faint">Approved budget</div>
                    <div className="font-mono text-lg font-semibold text-ink">${data.cost_intelligence.budget_usd?.toFixed(2)}/mo</div>
                  </div>
                  <div>
                    <div className="text-ink-faint">Spent so far</div>
                    <div className="font-mono text-lg font-semibold text-ink">${data.cost_intelligence.total_cost_usd.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-ink-faint">Projected monthly</div>
                    <div className={`font-mono text-lg font-semibold ${data.cost_intelligence.over_budget ? 'text-bad' : 'text-ink'}`}>
                      ${data.cost_intelligence.projected_monthly_usd.toFixed(2)}/mo
                    </div>
                  </div>
                </div>
              </BentoCard>
            </Section>

            <Section title="Cross-Project Patterns" subtitle="Kavacha's growing, shared intelligence -- not specific to this project.">
              <div className="space-y-3">
                {data.fix_patterns.map((p) => (
                  <BentoCard key={p.issue_type}>
                    <p className="font-medium text-ink">
                      Kavacha has seen "{p.issue_type}" in {p.project_count} projects -- here's the fix
                    </p>
                    <p className="mt-1 text-sm text-ink-dim">{p.fix_template}</p>
                    <p className="mt-1 text-xs text-ink-faint">{(p.success_rate * 100).toFixed(0)}% success rate</p>
                  </BentoCard>
                ))}
              </div>
            </Section>

            <Section title="Compliance Report" subtitle="Generated on demand from the real audit trail -- this one is illustrative.">
              <BentoCard>
                <p className="mb-3 text-xs text-ink-faint">{data.compliance_report.disclaimer}</p>
                <p className="mb-1 text-sm font-medium text-ink">SOC2 evidence</p>
                <ul className="mb-3 list-inside list-disc text-sm text-ink-dim">
                  {data.compliance_report.soc2_evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                <p className="text-xs text-ink-faint">Snapshot {data.compliance_report.snapshot_id}</p>
              </BentoCard>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
