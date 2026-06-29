import { useState, type FormEvent } from 'react'
import { ErrorBanner } from '../ErrorBanner'
import { useToast } from '../../context/ToastContext'
import { ApiError, apiFetch } from '../../lib/api'
import { FRAMEWORKS } from './frameworks'

const AI_MODELS = ['Claude', 'GPT-4', 'Gemini', 'Llama', 'Groq', 'Other']

export interface CreatedProject {
  projectId: string
  apiKey: string
  framework: string
}

// Used both by OnboardingPage's Step 2 (framework already chosen in Step 1,
// shown read-only) and by /projects/new (no prior step, so the framework
// picker renders inline as part of this same form instead).
export function ProjectDetailsForm({
  initialFramework,
  onCreated,
}: {
  initialFramework?: string
  onCreated: (result: CreatedProject) => void
}) {
  const { showToast } = useToast()
  const [framework, setFramework] = useState(initialFramework ?? FRAMEWORKS[0])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [aiModel, setAiModel] = useState(AI_MODELS[0])
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [deployedUrl, setDeployedUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await apiFetch<{ project_id: string; api_key: string }>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          ai_model: aiModel,
          framework,
          monthly_budget: monthlyBudget ? Number(monthlyBudget) : null,
          deployed_url: deployedUrl || null,
        }),
      })
      showToast('Project created')
      onCreated({ projectId: result.project_id, apiKey: result.api_key, framework })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      {error && <ErrorBanner message={error} />}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-dim">Project name *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-dim">What does it do? *</label>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="2-3 sentences"
            className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-dim">AI model</label>
          <div className="flex flex-wrap gap-2">
            {AI_MODELS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAiModel(m)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  aiModel === m ? 'border-saffron-bright bg-saffron/10 text-saffron-bright' : 'border-edge text-ink-dim hover:border-saffron-bright'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-dim">Framework</label>
          {initialFramework ? (
            <p className="rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm text-ink-dim">{framework}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {FRAMEWORKS.map((fw) => (
                <button
                  key={fw}
                  type="button"
                  onClick={() => setFramework(fw)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    framework === fw ? 'border-saffron-bright bg-saffron/10 text-saffron-bright' : 'border-edge text-ink-dim hover:border-saffron-bright'
                  }`}
                >
                  {fw}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-dim">Monthly API budget ($) *</label>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-dim">Deployed URL (optional)</label>
          <input
            type="url"
            value={deployedUrl}
            onChange={(e) => setDeployedUrl(e.target.value)}
            placeholder="https://"
            className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md gradient-bg px-3 py-2 text-sm font-medium text-surface disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create project'}
        </button>
      </form>
    </div>
  )
}
