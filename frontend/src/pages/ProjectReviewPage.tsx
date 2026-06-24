import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { ApiError, apiFetch } from '../lib/api'
import type { CEOReviewResult, MemoryEntry } from '../lib/types'

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
}

function ResultBanner({ result }: { result: CEOReviewResult }) {
  return (
    <div
      className={`mb-6 rounded-lg border p-4 ${
        result.approved ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${result.approved ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {result.approved ? 'Approved' : 'Issues Found'}
        </span>
      </div>
      <p className="mb-3 text-sm text-gray-800">{result.summary}</p>
      {result.issues.length > 0 && (
        <ul className="space-y-2">
          {result.issues.map((issue, i) => (
            <li key={i} className="rounded border border-gray-200 bg-white p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[issue.severity] ?? 'bg-gray-100 text-gray-700'}`}>
                  {issue.severity}
                </span>
                <span className="font-medium text-gray-700">{issue.requirement_reference}</span>
              </div>
              <p className="text-gray-600">{issue.gap_description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ProjectReviewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [history, setHistory] = useState<MemoryEntry[] | null>(null)
  const [result, setResult] = useState<CEOReviewResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadHistory() {
    if (!projectId) return
    apiFetch<MemoryEntry[]>(`/api/v1/projects/${projectId}/memory`)
      .then((entries) => setHistory(entries.filter((e) => e.decision_type === 'ceo_review')))
      .catch((err: ApiError) => setError(err.message))
  }

  useEffect(loadHistory, [projectId])

  async function handleRun() {
    if (!projectId) return
    setRunning(true)
    setError(null)
    try {
      const r = await apiFetch<CEOReviewResult>('/api/v1/ceo_review/run', {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId }),
      })
      setResult(r)
      loadHistory()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'CEO review failed')
    } finally {
      setRunning(false)
    }
  }

  if (!projectId) return null

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      <p className="mb-6 text-sm text-gray-500">
        The AI switches roles entirely -- it becomes the demanding client, comparing what was promised against what was delivered.
      </p>

      <button
        type="button"
        onClick={handleRun}
        disabled={running}
        className="mb-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {running ? 'Reviewing as CEO...' : 'Run CEO Review'}
      </button>

      {error && <ErrorBanner message={error} />}
      {result && <ResultBanner result={result} />}

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Review History</h2>
      {history === null ? (
        <Spinner label="Loading history..." />
      ) : history.length === 0 ? (
        <p className="text-gray-500">No reviews run yet.</p>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    entry.content.includes('APPROVED') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {entry.content.includes('APPROVED') ? 'Approved' : 'Issues Found'}
                </span>
                <span className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{entry.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
