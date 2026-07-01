import { Link, useLocation } from 'react-router-dom'

export function ProjectTabs({ projectId }: { projectId: string }) {
  const { pathname } = useLocation()

  const tabs = [
    { label: 'Overview', to: `/projects/${projectId}/overview` },
    { label: 'Memory', to: `/projects/${projectId}/memory` },
    { label: 'Issues', to: `/projects/${projectId}/issues` },
    { label: 'CEO Review', to: `/projects/${projectId}/review` },
    { label: 'Requirements', to: `/projects/${projectId}/requirements` },
    { label: 'Monitor', to: `/projects/${projectId}/monitor` },
    { label: 'SDK Setup', to: `/projects/${projectId}/sdk-setup` },
    { label: 'Settings', to: `/projects/${projectId}/settings` },
  ]

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-edge">
      {tabs.map((tab) => {
        const active = pathname === tab.to
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${
              active ? 'border-b-2 border-saffron text-ink' : 'text-ink-faint hover:text-ink-dim'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
