import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { FixEngineReplay } from '../components/FixEngineReplay'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { ApiError, apiFetch } from '../lib/api'
import type { Issue } from '../lib/types'

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-bad/10 text-bad',
  WARNING: 'bg-warn/10 text-warn',
  INFO: 'bg-saffron/10 text-saffron-bright',
}

export function ProjectIssuesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    apiFetch<Issue[]>(`/api/v1/projects/${projectId}/issues`)
      .then(setIssues)
      .catch((err: ApiError) => setError(err.message))
  }, [projectId])

  if (!projectId) return null

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      <p className="mb-6 text-sm text-ink-dim">Every issue Kavacha has detected for this project.</p>

      {error && <ErrorBanner message={error} />}
      {!error && issues === null && <Spinner label="Loading issues..." />}
      {issues?.length === 0 && <p className="text-ink-faint">No issues detected. This project is healthy.</p>}

      {issues && issues.length > 0 && (
        <div className="space-y-3">
          {issues.map((issue) => (
            <BentoCard key={issue.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[issue.severity] ?? 'bg-edge text-ink-dim'}`}>
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
              {issue.fix_applied && <FixEngineReplay issue={issue} />}
            </BentoCard>
          ))}
        </div>
      )}
    </div>
  )
}
