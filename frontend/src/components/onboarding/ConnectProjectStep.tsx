import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BentoCard } from '../ui/BentoCard'
import { CodeBlock } from '../ui/CodeBlock'
import { CopyButton } from '../ui/CopyButton'
import { PulseDot } from '../ui/PulseDot'
import { apiFetch } from '../../lib/api'

const WATCH_TARGETS: Record<string, string> = {
  LangChain: 'chain',
  LangGraph: 'graph',
  CrewAI: 'crew',
  'OpenAI Agents': 'agent',
}

export function ConnectProjectStep({
  projectId,
  apiKey,
  framework,
  doneLabel = 'Skip for now →',
}: {
  projectId: string
  apiKey: string
  framework: string
  doneLabel?: string
}) {
  const navigate = useNavigate()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (connected) return
    let cancelled = false
    async function poll() {
      try {
        const status = await apiFetch<{ connected: boolean }>(`/api/v1/projects/${projectId}/connection-status`)
        if (!cancelled && status.connected) setConnected(true)
      } catch {
        // Transient poll failure -- the next 5s tick tries again.
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [projectId, connected])

  useEffect(() => {
    if (!connected) return
    const id = setTimeout(() => navigate('/dashboard'), 2000)
    return () => clearTimeout(id)
  }, [connected, navigate])

  const watchTarget = WATCH_TARGETS[framework] ?? 'your_pipeline'
  const initSnippet = `import kavacha\nkavacha.init(\n  "${apiKey}",\n  "${projectId}"\n)\nkavacha.watch(${watchTarget})`

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Connect your project</h1>
      <p className="mb-6 text-sm text-ink-dim">Paste this into your project -- Kavacha starts watching the moment it runs.</p>

      <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
        <span>Save this key now -- it's shown only once.</span>
        <CopyButton text={apiKey} label="Copy key" />
      </div>

      <BentoCard className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Install Kavacha</p>
        <CodeBlock code="pip install kavacha" />
      </BentoCard>

      <BentoCard className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Add to your project</p>
        <CodeBlock code={initSnippet} />
      </BentoCard>

      <div className="mb-6 flex items-center gap-2 rounded-md border border-edge bg-card px-4 py-3">
        <PulseDot color={connected ? 'ok' : 'saffron'} live={!connected} />
        <span className="text-sm text-ink-dim">
          {connected ? 'Connected! Kavacha is now watching your project.' : 'Waiting for first event from your project...'}
        </span>
      </div>

      <Link to="/dashboard" className="text-sm text-ink-faint hover:text-ink-dim">
        {doneLabel}
      </Link>
    </div>
  )
}
