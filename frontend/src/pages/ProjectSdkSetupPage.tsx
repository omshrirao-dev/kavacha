import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { CodeBlock } from '../components/ui/CodeBlock'
import { CopyButton } from '../components/ui/CopyButton'
import { PulseDot } from '../components/ui/PulseDot'
import { useToast } from '../context/ToastContext'
import { ApiError, apiFetch } from '../lib/api'
import type { ProjectDetail } from '../lib/types'

interface ApiKeySummary {
  id: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked: boolean
}

interface ConnectionStatus {
  connected: boolean
  last_event: string | null
}

const WATCH_TARGETS: Record<string, string> = {
  LangChain: 'chain',
  LangGraph: 'graph',
  CrewAI: 'crew',
  'OpenAI Agents': 'agent',
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function ProjectSdkSetupPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { showToast } = useToast()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadKeys(id: string) {
    apiFetch<ApiKeySummary[]>(`/api/v1/projects/${id}/api-keys`).then(setKeys).catch((err: ApiError) => setError(err.message))
  }

  useEffect(() => {
    if (!projectId) return
    apiFetch<ProjectDetail>(`/api/v1/projects/${projectId}`).then(setProject).catch((err: ApiError) => setError(err.message))
    loadKeys(projectId)
    apiFetch<ConnectionStatus>(`/api/v1/projects/${projectId}/connection-status`).then(setConnection).catch(() => {})
  }, [projectId])

  async function handleRegenerate() {
    if (!projectId) return
    setRegenerating(true)
    setError(null)
    try {
      const result = await apiFetch<{ api_key: string }>(`/api/v1/projects/${projectId}/api-keys/regenerate`, { method: 'POST' })
      setNewKey(result.api_key)
      setConfirmRegenerate(false)
      loadKeys(projectId)
      showToast('Key regenerated')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to regenerate key')
    } finally {
      setRegenerating(false)
    }
  }

  if (!projectId) return null

  const activeKey = keys?.find((k) => !k.revoked)
  const displayKey = newKey ?? (activeKey ? `${activeKey.key_prefix}${'•'.repeat(28)}` : null)
  const watchTarget = (project?.framework && WATCH_TARGETS[project.framework]) ?? 'your_pipeline'
  const initSnippet = `import kavacha\nkavacha.init(\n  "${newKey ?? 'kv_...'}",\n  "${projectId}"\n)\nkavacha.watch(${watchTarget})`

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      {error && <ErrorBanner message={error} />}

      {newKey && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          <span>
            New key generated -- save it now, it won't be shown again: <span className="font-mono">{newKey}</span>
          </span>
          <CopyButton text={newKey} label="Copy key" />
        </div>
      )}

      <BentoCard className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Your API key</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-sm text-ink-dim">{displayKey ?? 'No active key'}</span>
          <div className="flex gap-2">
            {confirmRegenerate ? (
              <>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="rounded-md border border-bad/40 px-3 py-1.5 text-xs font-medium text-bad hover:bg-bad/10 disabled:opacity-50"
                >
                  {regenerating ? 'Regenerating...' : 'Confirm: invalidate old key'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRegenerate(false)}
                  className="rounded-md border border-edge px-3 py-1.5 text-xs text-ink-dim"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRegenerate(true)}
                className="rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink-dim hover:border-saffron-bright hover:text-ink"
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
      </BentoCard>

      <BentoCard className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Project ID</p>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-sm text-ink-dim">{projectId}</span>
          <CopyButton text={projectId} />
        </div>
      </BentoCard>

      <BentoCard className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Install Kavacha</p>
        <CodeBlock code="pip install kavacha" />
      </BentoCard>

      <BentoCard className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Usage</p>
        <CodeBlock code={initSnippet} />
        {!newKey && (
          <p className="mt-2 text-xs text-ink-faint">
            Replace "kv_..." with your real key -- it's only ever shown in full right after creation or regeneration.
          </p>
        )}
      </BentoCard>

      <div className="flex items-center gap-2 rounded-md border border-edge bg-card px-4 py-3">
        {connection === null ? (
          <Spinner label="Checking connection..." />
        ) : connection.connected ? (
          <>
            <PulseDot color="ok" live={false} />
            <span className="text-sm text-ink-dim">
              Connected -- last event {connection.last_event ? timeAgo(connection.last_event) : 'recently'}
            </span>
          </>
        ) : (
          <>
            <PulseDot color="bad" live={false} />
            <span className="text-sm text-ink-dim">Not connected -- no events received yet</span>
          </>
        )}
      </div>
    </div>
  )
}
