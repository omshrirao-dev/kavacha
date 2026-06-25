import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { Project } from '../lib/types'
import { HealthBadge } from './HealthBadge'

// Stale-while-revalidate: switching tabs (Memory/Issues/Review/Monitor)
// mounts a fresh ProjectHeader each time -- without this, the name+health
// badge flash to "..." on every single tab click, even though the project
// itself rarely changes between clicks.
const projectCache = new Map<string, Project>()

export function ProjectHeader({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(projectCache.get(projectId) ?? null)

  useEffect(() => {
    apiFetch<Project>(`/api/v1/projects/${projectId}`)
      .then((p) => {
        projectCache.set(projectId, p)
        setProject(p)
      })
      .catch(() => {})
  }, [projectId])

  return (
    <div className="mb-4">
      <Link to="/dashboard" className="text-sm text-ink-faint hover:text-ink-dim">
        &larr; Back to projects
      </Link>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-ink">{project?.name ?? '...'}</h1>
        {project && <HealthBadge status={project.health} />}
      </div>
    </div>
  )
}
