import { Link, useLocation } from 'react-router-dom'

export function ProjectTabs({ projectId }: { projectId: string }) {
  const { pathname } = useLocation()

  const tabs = [
    { label: 'Memory', to: `/projects/${projectId}/memory` },
    { label: 'Issues', to: `/projects/${projectId}/issues` },
    { label: 'CEO Review', to: `/projects/${projectId}/review` },
    { label: 'Monitor', to: `/projects/${projectId}/monitor` },
  ]

  return (
    <div className="mb-6 flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => {
        const active = pathname === tab.to
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`px-4 py-2 text-sm font-medium ${
              active ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
