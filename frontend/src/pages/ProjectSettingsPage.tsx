import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { useToast } from '../context/ToastContext'
import { ApiError, apiFetch } from '../lib/api'
import type { ProjectDetail } from '../lib/types'

export function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [deployedUrl, setDeployedUrl] = useState('')
  const [notificationEmail, setNotificationEmail] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!projectId) return
    apiFetch<ProjectDetail>(`/api/v1/projects/${projectId}`)
      .then((p) => {
        setProject(p)
        setName(p.name)
        setDescription(p.description ?? '')
        setMonthlyBudget(p.monthly_budget !== null ? String(p.monthly_budget) : '')
        setDeployedUrl(p.deployed_url ?? '')
        setNotificationEmail(p.notification_email ?? '')
        setAlertsEnabled(p.alerts_enabled)
      })
      .catch((err: ApiError) => setError(err.message))
  }, [projectId])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          description,
          monthly_budget: monthlyBudget ? Number(monthlyBudget) : null,
          deployed_url: deployedUrl || null,
          notification_email: notificationEmail || null,
          alerts_enabled: alertsEnabled,
        }),
      })
      showToast('Settings saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!projectId || !project || deleteConfirmText !== project.name) return
    setDeleting(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/projects/${projectId}`, { method: 'DELETE' })
      showToast('Project deleted')
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete project')
      setDeleting(false)
    }
  }

  if (!projectId) return null

  if (!project) {
    return (
      <div>
        <ProjectHeader projectId={projectId} />
        <ProjectTabs projectId={projectId} />
        {error ? <ErrorBanner message={error} /> : <Spinner label="Loading settings..." />}
      </div>
    )
  }

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      {error && <ErrorBanner message={error} />}

      <BentoCard className="mb-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-dim">Project name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-dim">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-dim">Monthly API budget ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-dim">Deployed URL</label>
            <input
              type="url"
              value={deployedUrl}
              onChange={(e) => setDeployedUrl(e.target.value)}
              placeholder="https://"
              className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-dim">Notification email</label>
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="Defaults to your account email"
              className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-edge accent-saffron"
            />
            Email alerts on issues
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </form>
      </BentoCard>

      <BentoCard className="border-bad/30">
        <p className="mb-1 text-sm font-semibold text-bad">Delete project</p>
        <p className="mb-3 text-sm text-ink-dim">
          This permanently deletes the project, its memory, issues, and API keys. This cannot be undone.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={`Type "${project.name}" to confirm`}
            className="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-bad focus:outline-none focus:ring-1 focus:ring-bad/40"
          />
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteConfirmText !== project.name || deleting}
            className="rounded-md border border-bad/40 px-4 py-2 text-sm font-medium text-bad hover:bg-bad/10 disabled:opacity-40"
          >
            {deleting ? 'Deleting...' : 'Delete project'}
          </button>
        </div>
      </BentoCard>
    </div>
  )
}
