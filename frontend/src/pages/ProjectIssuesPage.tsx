import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ProjectTabs } from '../components/ProjectTabs'
import { ApiError, apiFetch } from '../lib/api'
import type { Issue } from '../lib/types'

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  INFO: 'bg-blue-100 text-blue-800',
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
      <ProjectTabs projectId={projectId} />
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Issue Log</h1>
      <p className="mb-6 text-sm text-gray-500">Every issue Kavacha has detected for this project.</p>

      {error && <p className="text-red-600">{error}</p>}
      {!error && issues === null && <p className="text-gray-500">Loading issues...</p>}
      {issues?.length === 0 && <p className="text-gray-500">No issues detected. This project is healthy.</p>}

      {issues && issues.length > 0 && (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[issue.severity] ?? 'bg-gray-100 text-gray-700'}`}>
                  {issue.severity}
                </span>
                <span className="text-xs text-gray-500">{issue.type}</span>
                <span className="ml-auto text-xs text-gray-500">{new Date(issue.detected_at).toLocaleString()}</span>
              </div>
              <p className="mb-1 text-sm text-gray-800">{issue.description}</p>
              {issue.root_cause && <p className="text-xs text-gray-500">Root cause: {issue.root_cause}</p>}
              <div className="mt-2 flex gap-3 text-xs text-gray-500">
                <span>{issue.fix_applied ? 'Fix applied' : 'No fix applied yet'}</span>
                <span>{issue.verified ? 'Verified' : 'Unverified'}</span>
                {issue.time_to_resolve_mins !== null && <span>Resolved in {issue.time_to_resolve_mins}m</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
