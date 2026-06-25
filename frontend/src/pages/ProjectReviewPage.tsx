import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { ApiError, apiFetch } from '../lib/api'
import type { CEOReviewResult, MemoryEntry } from '../lib/types'

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-bad/10 text-bad',
  high: 'bg-bad/10 text-bad',
  medium: 'bg-warn/10 text-warn',
  low: 'bg-saffron/10 text-saffron-bright',
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-saffron-bright"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  )
}

function ResultBanner({ result }: { result: CEOReviewResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`mb-6 rounded-lg border p-4 ${result.approved ? 'border-ok/40 bg-ok/5' : 'border-bad/40 bg-bad/5'}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <motion.span
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className={`rounded-full px-3 py-1 text-sm font-semibold ${result.approved ? 'bg-ok text-surface' : 'bg-bad text-surface'}`}
        >
          {result.approved ? 'Approved' : 'Issues Found'}
        </motion.span>
      </div>
      <p className="mb-3 text-sm text-ink">{result.summary}</p>
      {result.issues.length > 0 && (
        <ul className="space-y-2">
          {result.issues.map((issue, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
              className="rounded border border-edge bg-surface-2 p-3 text-sm"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[issue.severity] ?? 'bg-edge text-ink-dim'}`}>
                  {issue.severity}
                </span>
                <span className="font-medium text-ink-dim">{issue.requirement_reference}</span>
              </div>
              <p className="text-ink-dim">{issue.gap_description}</p>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
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
    setResult(null)
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
      <p className="mb-6 text-sm text-ink-dim">
        The Critic -- the AI switches roles entirely, becoming the demanding client comparing what was promised against
        what was delivered.
      </p>

      <button
        type="button"
        onClick={handleRun}
        disabled={running}
        className="mb-6 rounded-md bg-saffron px-4 py-2 text-sm font-medium text-surface hover:bg-saffron-bright disabled:opacity-50"
      >
        {running ? 'Reviewing as CEO...' : 'Run CEO Review'}
      </button>

      {error && <ErrorBanner message={error} />}

      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mb-6"
          >
            <BentoCard>
              <p className="flex items-center gap-2 text-sm text-ink-dim">
                The CEO is reviewing your product <ThinkingDots />
              </p>
            </BentoCard>
          </motion.div>
        )}
      </AnimatePresence>

      {result && <ResultBanner result={result} />}

      <h2 className="mb-3 text-sm font-semibold text-ink-dim">Review History</h2>
      {history === null ? (
        <Spinner label="Loading history..." />
      ) : history.length === 0 ? (
        <p className="text-ink-faint">No reviews run yet.</p>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <BentoCard key={entry.id}>
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    entry.content.includes('APPROVED') ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad'
                  }`}
                >
                  {entry.content.includes('APPROVED') ? 'Approved' : 'Issues Found'}
                </span>
                <span className="text-xs text-ink-faint">{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-dim">{entry.content}</p>
            </BentoCard>
          ))}
        </div>
      )}
    </div>
  )
}
