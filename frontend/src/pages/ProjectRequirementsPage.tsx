import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { useToast } from '../context/ToastContext'
import { ApiError, apiFetch } from '../lib/api'
import type { ProjectRequirements } from '../lib/types'

const RESPONSE_STYLES = [
  'Formal and professional',
  'Friendly and conversational',
  'Technical and detailed',
  'Brief and to-the-point',
  'Empathetic and supportive',
]

const ACCURACY_OPTIONS = [80, 90, 95, 99]

const SPEED_OPTIONS = ['1s', '2s', '3s', '5s', 'any'] as const
const SPEED_MS: Record<(typeof SPEED_OPTIONS)[number], number | null> = {
  '1s': 1000,
  '2s': 2000,
  '3s': 3000,
  '5s': 5000,
  any: null,
}

function speedLabelFromMs(ms: number | null): (typeof SPEED_OPTIONS)[number] {
  const found = SPEED_OPTIONS.find((label) => SPEED_MS[label] === ms)
  return found ?? 'any'
}

export function ProjectRequirementsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { showToast } = useToast()
  const [loaded, setLoaded] = useState(false)
  const [corePurpose, setCorePurpose] = useState('')
  const [mustNeverDo, setMustNeverDo] = useState('')
  const [responseStyle, setResponseStyle] = useState(RESPONSE_STYLES[0])
  const [accuracyThreshold, setAccuracyThreshold] = useState(95)
  const [speedRequirement, setSpeedRequirement] = useState<(typeof SPEED_OPTIONS)[number]>('any')
  const [targetAudience, setTargetAudience] = useState('')
  const [specificRules, setSpecificRules] = useState('')
  const [successDefinition, setSuccessDefinition] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    apiFetch<ProjectRequirements | null>(`/api/v1/projects/${projectId}/requirements`)
      .then((r) => {
        if (r) {
          setCorePurpose(r.core_purpose)
          setMustNeverDo(r.must_never_do)
          setResponseStyle(r.response_style)
          setAccuracyThreshold(r.accuracy_threshold)
          setSpeedRequirement(speedLabelFromMs(r.speed_requirement_ms))
          setTargetAudience(r.target_audience ?? '')
          setSpecificRules(r.specific_rules ?? '')
          setSuccessDefinition(r.success_definition ?? '')
          setUpdatedAt(r.updated_at)
        }
        setLoaded(true)
      })
      .catch((err: ApiError) => {
        setError(err.message)
        setLoaded(true)
      })
  }, [projectId])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/v1/projects/${projectId}/requirements`, {
        method: 'PUT',
        body: JSON.stringify({
          core_purpose: corePurpose,
          must_never_do: mustNeverDo,
          response_style: responseStyle,
          accuracy_threshold: accuracyThreshold,
          speed_requirement: speedRequirement,
          target_audience: targetAudience || null,
          specific_rules: specificRules || null,
          success_definition: successDefinition || null,
        }),
      })
      showToast('Requirements saved -- CEO Review will now check against these specifically')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save requirements')
    } finally {
      setSaving(false)
    }
  }

  if (!projectId) return null

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      {error && <ErrorBanner message={error} />}

      {!loaded ? (
        <Spinner label="Loading requirements..." />
      ) : (
        <BentoCard className="mb-6">
          <p className="mb-1 text-sm font-semibold text-ink">What does your client / end user expect?</p>
          <p className="mb-4 text-sm text-ink-dim">
            CEO Review reads these directly and checks your AI product against them specifically -- not a generic
            "is this good" pass.
          </p>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-dim">
                What is the single most important thing your AI must do?
              </label>
              <textarea
                required
                rows={2}
                maxLength={200}
                value={corePurpose}
                onChange={(e) => setCorePurpose(e.target.value)}
                placeholder="Answer customer questions about our return policy accurately"
                className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-dim">What should your AI NEVER say or do?</label>
              <textarea
                required
                rows={2}
                maxLength={200}
                value={mustNeverDo}
                onChange={(e) => setMustNeverDo(e.target.value)}
                placeholder="Never invent policies that don't exist. Never promise refunds not in policy."
                className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-dim">How should responses feel to your users?</label>
              <select
                value={responseStyle}
                onChange={(e) => setResponseStyle(e.target.value)}
                className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
              >
                {RESPONSE_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-dim">How accurate must responses be?</label>
              <select
                value={accuracyThreshold}
                onChange={(e) => setAccuracyThreshold(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
              >
                {ACCURACY_OPTIONS.map((pct) => (
                  <option key={pct} value={pct}>
                    {pct}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-dim">Maximum acceptable response time?</label>
              <select
                value={speedRequirement}
                onChange={(e) => setSpeedRequirement(e.target.value as (typeof SPEED_OPTIONS)[number])}
                className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
              >
                {SPEED_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'any' ? 'Any' : opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-edge pt-4">
              <p className="mb-3 text-sm font-medium text-ink">Optional</p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-ink-dim">Who are your end users?</label>
                <input
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  maxLength={500}
                  placeholder="Indian e-commerce customers, mostly on mobile, Hindi and English"
                  className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-ink-dim">
                  Any specific things your client mentioned that the AI must follow?
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={specificRules}
                  onChange={(e) => setSpecificRules(e.target.value)}
                  className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-dim">
                  How will you know if your AI is working correctly?
                </label>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={successDefinition}
                  onChange={(e) => setSuccessDefinition(e.target.value)}
                  placeholder="Users resolve issues without contacting human support"
                  className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save requirements'}
              </button>
              {updatedAt && <span className="text-xs text-ink-faint">Last updated {new Date(updatedAt).toLocaleString()}</span>}
            </div>
          </form>
        </BentoCard>
      )}
    </div>
  )
}
