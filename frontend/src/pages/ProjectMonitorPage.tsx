import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { PulseDot } from '../components/ui/PulseDot'
import { ApiError, apiFetch } from '../lib/api'
import type { ComplianceReport, CostIntelligence, FixPattern, MonitorJobStatus, MonitorStatus } from '../lib/types'

const TRACK_LABELS = {
  track_a: 'Track A -- Hallucination',
  track_b: 'Track B -- Cost',
  track_c: 'Track C -- Drift',
} as const

function useCountdown(target: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    const targetTime = new Date(target).getTime()
    function tick() {
      const ms = targetTime - Date.now()
      if (ms <= 0) {
        setLabel('due now')
        return
      }
      const mins = Math.floor(ms / 60000)
      const hrs = Math.floor(mins / 60)
      setLabel(hrs > 0 ? `in ${hrs}h ${mins % 60}m` : `in ${mins}m`)
    }
    tick()
    const id = setInterval(tick, 15000)
    return () => clearInterval(id)
  }, [target])

  return target ? label : null
}

function TrackCard({ track, status }: { track: keyof typeof TRACK_LABELS; status: MonitorJobStatus }) {
  const countdown = useCountdown(status.next_run)
  return (
    <BentoCard>
      <div className="flex items-center gap-2">
        <PulseDot color={status.running ? 'saffron' : 'idle'} live={status.running} />
        <span className="text-sm font-medium text-ink">{TRACK_LABELS[track]}</span>
      </div>
      <p className="mt-2 text-xs text-ink-dim">{status.running ? 'Scheduled' : 'Not scheduled'}</p>
      {countdown && <p className="mt-1 font-mono text-xs text-ink-faint">Next check {countdown}</p>}
    </BentoCard>
  )
}

function CostWidget({ cost }: { cost: CostIntelligence }) {
  if (cost.budget_usd === null) {
    return <p className="text-sm text-ink-faint">No approved budget recorded for this project yet (run the Architect Agent to set one).</p>
  }
  return (
    <BentoCard className={cost.over_budget ? 'border-bad/40' : ''}>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-ink-faint">Approved budget</div>
          <div className="font-mono text-lg font-semibold text-ink">${cost.budget_usd.toFixed(2)}/mo</div>
        </div>
        <div>
          <div className="text-ink-faint">Spent so far</div>
          <div className="font-mono text-lg font-semibold text-ink">${cost.total_cost_usd.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-ink-faint">Projected monthly</div>
          <div className={`font-mono text-lg font-semibold ${cost.over_budget ? 'text-bad' : 'text-ink'}`}>
            ${cost.projected_monthly_usd.toFixed(2)}/mo
          </div>
        </div>
      </div>
      {cost.over_budget && (
        <p className="mt-3 text-sm text-bad">
          Projected cost exceeds the approved budget by more than 20% (based on {cost.days_elapsed.toFixed(2)} days of usage).
        </p>
      )}
    </BentoCard>
  )
}

export function ProjectMonitorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null)
  const [cost, setCost] = useState<CostIntelligence | null>(null)
  const [patterns, setPatterns] = useState<FixPattern[] | null>(null)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  function loadStatus() {
    if (!projectId) return
    apiFetch<{ jobs: MonitorStatus }>(`/api/v1/monitor/status?project_id=${projectId}`)
      .then((r) => {
        setMonitorStatus(r.jobs)
        setLastChecked(new Date())
      })
      .catch((err: ApiError) => setError(err.message))
    apiFetch<CostIntelligence>(`/api/v1/monitor/cost?project_id=${projectId}`)
      .then(setCost)
      .catch((err: ApiError) => setError(err.message))
  }

  useEffect(loadStatus, [projectId])

  useEffect(() => {
    apiFetch<FixPattern[]>('/api/v1/fix-patterns').then(setPatterns).catch(() => setPatterns([]))
  }, [])

  async function handleStartStop(action: 'start' | 'stop') {
    if (!projectId) return
    setRunning(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/monitor/${action}`, { method: 'POST', body: JSON.stringify({ project_id: projectId }) })
      loadStatus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action} monitoring`)
    } finally {
      setRunning(false)
    }
  }

  async function handleManualTest() {
    if (!projectId) return
    setRunning(true)
    setError(null)
    try {
      await apiFetch('/api/v1/monitor/test', { method: 'POST', body: JSON.stringify({ project_id: projectId, track: 'all' }) })
      loadStatus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Manual check failed')
    } finally {
      setRunning(false)
    }
  }

  async function handleComplianceReport() {
    if (!projectId) return
    try {
      const r = await apiFetch<ComplianceReport>('/api/v1/compliance/report', {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId }),
      })
      setReport(r)
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kavacha-compliance-${projectId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Compliance report failed')
    }
  }

  if (!projectId) return null

  const anyRunning = monitorStatus && Object.values(monitorStatus).some((j) => j.running)

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      <p className="mb-6 text-sm text-ink-dim">The Watchtower -- the permanent AI engineer that never sleeps.</p>

      {error && <ErrorBanner message={error} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleStartStop('start')}
          disabled={running}
          className="rounded-md bg-saffron px-4 py-2 text-sm font-medium text-surface hover:bg-saffron-bright disabled:opacity-50"
        >
          Start Monitoring
        </button>
        <button
          type="button"
          onClick={() => handleStartStop('stop')}
          disabled={running}
          className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:border-saffron-bright disabled:opacity-50"
        >
          Stop Monitoring
        </button>
        <button
          type="button"
          onClick={handleManualTest}
          disabled={running}
          className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:border-saffron-bright disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run Manual Check (all tracks)'}
        </button>
        <button
          type="button"
          onClick={handleComplianceReport}
          className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:border-saffron-bright sm:ml-auto"
        >
          Download Compliance Report
        </button>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <PulseDot color={anyRunning ? 'ok' : 'idle'} live={!!anyRunning} />
        <span className="text-sm text-ink-dim">{anyRunning ? 'Monitoring active' : 'Monitoring stopped'}</span>
        {lastChecked && <span className="text-xs text-ink-faint">&middot; last checked {lastChecked.toLocaleTimeString()}</span>}
      </div>

      {monitorStatus && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['track_a', 'track_b', 'track_c'] as const).map((track) => (
            <TrackCard key={track} track={track} status={monitorStatus[track]} />
          ))}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-ink-dim">Cost Intelligence</h2>
      {cost ? <CostWidget cost={cost} /> : <Spinner label="Loading cost data..." />}

      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink-dim">Cross-Project Patterns</h2>
      {patterns === null ? (
        <Spinner label="Loading patterns..." />
      ) : patterns.length === 0 ? (
        <p className="text-ink-faint">No fix patterns learned yet across any project.</p>
      ) : (
        <div className="space-y-2">
          {patterns.map((p) => (
            <BentoCard key={p.issue_type}>
              <p className="text-sm font-medium text-ink">
                Kavacha has seen "{p.issue_type}" in {p.project_count} project{p.project_count === 1 ? '' : 's'} -- here's the fix
              </p>
              <p className="mt-1 text-sm text-ink-dim">{p.fix_template}</p>
              <p className="mt-1 text-xs text-ink-faint">{(p.success_rate * 100).toFixed(0)}% success rate</p>
            </BentoCard>
          ))}
        </div>
      )}

      {report && (
        <p className="mt-4 text-xs text-ink-faint">Compliance report generated and downloaded (snapshot {report.snapshot_id}).</p>
      )}
    </div>
  )
}
