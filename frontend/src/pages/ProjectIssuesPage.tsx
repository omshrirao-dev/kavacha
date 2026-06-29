import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { FixEngineReplay } from '../components/FixEngineReplay'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { BentoCard } from '../components/ui/BentoCard'
import { SkeletonCard } from '../components/ui/SkeletonCard'
import { useToast } from '../context/ToastContext'
import { ApiError, apiFetch } from '../lib/api'
import type { Issue } from '../lib/types'

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-bad/10 text-bad',
  WARNING: 'bg-warn/10 text-warn',
  INFO: 'bg-saffron/10 text-saffron-bright',
}

function isPending(issue: Issue): boolean {
  return !issue.fix_applied && !issue.dismissed && issue.proposed_fix_description !== null
}

export function ProjectIssuesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { showToast } = useToast()
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyIssueId, setBusyIssueId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'apply' | 'dismiss' | null>(null)

  function loadIssues() {
    if (!projectId) return
    apiFetch<Issue[]>(`/api/v1/projects/${projectId}/issues`)
      .then(setIssues)
      .catch((err: ApiError) => setError(err.message))
  }

  useEffect(loadIssues, [projectId])

  async function handleApplyFix(issueId: string) {
    if (!projectId) return
    setBusyIssueId(issueId)
    setBusyAction('apply')
    setError(null)
    try {
      const result = await apiFetch<{ verified: boolean }>(`/api/v1/projects/${projectId}/issues/${issueId}/apply-fix`, {
        method: 'POST',
      })
      showToast(result.verified ? 'Fixed and verified -- your users never noticed.' : 'Fix applied, but verification failed -- review it.', result.verified ? 'success' : 'error')
      loadIssues()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to apply fix')
    } finally {
      setBusyIssueId(null)
      setBusyAction(null)
    }
  }

  async function handleDismiss(issueId: string) {
    if (!projectId) return
    setBusyIssueId(issueId)
    setBusyAction('dismiss')
    setError(null)
    try {
      await apiFetch(`/api/v1/projects/${projectId}/issues/${issueId}/dismiss`, { method: 'POST' })
      showToast('Issue dismissed')
      loadIssues()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to dismiss issue')
    } finally {
      setBusyIssueId(null)
      setBusyAction(null)
    }
  }

  if (!projectId) return null

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      <p className="mb-6 text-sm text-ink-dim">Every issue Kavacha has detected for this project.</p>

      {error && <ErrorBanner message={error} />}
      {!error && issues === null && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}
      {issues?.length === 0 && <p className="text-ink-faint">No issues detected. This project is healthy.</p>}

      {issues && issues.length > 0 && (
        <div className="space-y-3">
          {issues.map((issue) => {
            const pending = isPending(issue)
            const busy = busyIssueId === issue.id ? busyAction : null
            return (
              <BentoCard key={issue.id} className={pending ? 'border-warn/40' : ''}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[issue.severity] ?? 'bg-edge text-ink-dim'}`}>
                    {issue.severity}
                  </span>
                  <span className="text-xs text-ink-faint">{issue.type}</span>
                  {pending && <span className="rounded bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">Needs your approval</span>}
                  {issue.dismissed && <span className="rounded bg-edge px-2 py-0.5 text-xs font-medium text-ink-faint">Dismissed</span>}
                  <span className="ml-auto text-xs text-ink-faint">{new Date(issue.detected_at).toLocaleString()}</span>
                </div>

                <p className="mb-1 text-sm text-ink">{issue.description}</p>
                {issue.root_cause && <p className="text-xs text-ink-dim">Root cause: {issue.root_cause}</p>}

                {pending && (
                  <div className="mt-3 rounded-md border border-edge bg-surface-2 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Fix available</p>
                    <p className="text-sm text-ink-dim">{issue.proposed_fix_description}</p>
                    {issue.estimated_cost_impact && (
                      <p className="mt-1 text-xs text-ink-faint">Estimated cost impact: {issue.estimated_cost_impact}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyFix(issue.id)}
                        disabled={busy !== null}
                        className="rounded-md gradient-bg px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-50"
                      >
                        {busy === 'apply' ? 'Applying fix... verifying...' : 'Apply Fix Automatically'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(issue.id)}
                        disabled={busy !== null}
                        className="rounded-md border border-edge px-3 py-1.5 text-xs text-ink-dim hover:border-bad/40 hover:text-bad disabled:opacity-50"
                      >
                        {busy === 'dismiss' ? 'Dismissing...' : 'Dismiss'}
                      </button>
                    </div>
                  </div>
                )}

                {!pending && (
                  <div className="mt-2 flex gap-3 text-xs text-ink-faint">
                    <span>{issue.fix_applied ? 'Fix applied' : 'No fix applied yet'}</span>
                    <span>{issue.verified ? 'Verified' : 'Unverified'}</span>
                    {issue.time_to_resolve_mins !== null && <span>Resolved in {issue.time_to_resolve_mins}m</span>}
                  </div>
                )}
                {!pending && issue.fix_applied && <FixEngineReplay issue={issue} />}
              </BentoCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
