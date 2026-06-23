import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HealthBadge } from '../components/HealthBadge'
import { ApiError, apiFetch } from '../lib/api'
import type { Project } from '../lib/types'

export function ProjectListPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Project[]>('/api/v1/projects')
      .then(setProjects)
      .catch((err: ApiError) => setError(err.message))
  }, [])

  if (error) return <p className="text-red-600">Failed to load projects: {error}</p>
  if (!projects) return <p className="text-gray-500">Loading projects...</p>

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Projects</h1>
      {projects.length === 0 ? (
        <p className="text-gray-500">No projects yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/projects/${p.id}/memory`} className="font-medium text-gray-900 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.status}</td>
                  <td className="px-4 py-3">
                    <HealthBadge status={p.health} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(p.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
