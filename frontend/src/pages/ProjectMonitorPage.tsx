import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { ApiError, apiFetch } from '../lib/api'
import type { ComplianceReport, CostIntelligence, FixPattern, MonitorStatus } from '../lib/types'

function CostWidget({ cost }: { cost: CostIntelligence }) {
  if (cost.budget_usd === null) {
    return <p className="text-sm text-gray-500">No approved budget recorded for this project yet (run the Architect Agent to set one).</p>
  }
  return (
    <div className={`rounded-lg border p-4 ${cost.over_budget ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-gray-500">Approved budget</div>
          <div className="text-lg font-semibold text-gray-900">${cost.budget_usd.toFixed(2)}/mo</div>
        </div>
        <div>
          <div className="text-gray-500">Spent so far</div>
          <div className="text-lg font-semibold text-gray-900">${cost.total_cost_usd.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-gray-500">Projected monthly</div>
          <div className={`text-lg font-semibold ${cost.over_budget ? 'text-red-700' : 'text-gray-900'}`}>
            ${cost.projected_monthly_usd.toFixed(2)}/mo
          </div>
        </div>
      </div>
      {cost.over_budget && (
        <p className="mt-3 text-sm text-red-700">
          Projected cost exceeds the approved budget by more than 20% (based on {cost.days_elapsed.toFixed(2)} days of usage).
        </p>
      )}
    </div>
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

  function loadStatus() {
    if (!projectId) return
    apiFetch<{ jobs: MonitorStatus }>(`/api/v1/monitor/status?project_id=${projectId}`)
      .then((r) => setMonitorStatus(r.jobs))
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
      <p className="mb-6 text-sm text-gray-500">The permanent AI engineer that never sleeps.</p>

      {error && <ErrorBanner message={error} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleStartStop('start')}
          disabled={running}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Start Monitoring
        </button>
        <button
          type="button"
          onClick={() => handleStartStop('stop')}
          disabled={running}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Stop Monitoring
        </button>
        <button
          type="button"
          onClick={handleManualTest}
          disabled={running}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run Manual Check (all tracks)'}
        </button>
        <button
          type="button"
          onClick={handleComplianceReport}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 sm:ml-auto"
        >
          Download Compliance Report
        </button>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${anyRunning ? 'bg-green-500' : 'bg-gray-300'}`} />
        <span className="text-sm text-gray-600">{anyRunning ? 'Monitoring active' : 'Monitoring stopped'}</span>
      </div>

      {monitorStatus && (
        <div className="mb-6 grid grid-cols-3 gap-3 text-sm">
          {(['track_a', 'track_b', 'track_c'] as const).map((track) => (
            <div key={track} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="font-medium text-gray-700">
                {track === 'track_a' ? 'Track A -- Hallucination' : track === 'track_b' ? 'Track B -- Cost' : 'Track C -- Drift'}
              </div>
              <div className="text-gray-500">{monitorStatus[track].running ? 'Scheduled' : 'Not scheduled'}</div>
              {monitorStatus[track].next_run && (
                <div className="text-xs text-gray-400">Next: {new Date(monitorStatus[track].next_run!).toLocaleString()}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Cost Intelligence</h2>
      {cost ? <CostWidget cost={cost} /> : <Spinner label="Loading cost data..." />}

      <h2 className="mb-3 mt-6 text-sm font-semibold text-gray-700">Cross-Project Patterns</h2>
      {patterns === null ? (
        <Spinner label="Loading patterns..." />
      ) : patterns.length === 0 ? (
        <p className="text-gray-500">No fix patterns learned yet across any project.</p>
      ) : (
        <div className="space-y-2">
          {patterns.map((p) => (
            <div key={p.issue_type} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <p className="font-medium text-gray-800">
                Kavacha has seen "{p.issue_type}" in {p.project_count} project{p.project_count === 1 ? '' : 's'} -- here's the fix
              </p>
              <p className="mt-1 text-gray-600">{p.fix_template}</p>
              <p className="mt-1 text-xs text-gray-400">{(p.success_rate * 100).toFixed(0)}% success rate</p>
            </div>
          ))}
        </div>
      )}

      {report && (
        <p className="mt-4 text-xs text-gray-400">Compliance report generated and downloaded (snapshot {report.snapshot_id}).</p>
      )}
    </div>
  )
}
