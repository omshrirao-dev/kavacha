import { useEffect, useState, type FormEvent } from 'react'
import { useToast } from '../context/ToastContext'
import { ApiError, apiFetch } from '../lib/api'
import type { AccountStatus } from '../lib/types'
import { BentoCard } from './ui/BentoCard'
import { WaitlistModal } from './WaitlistModal'

const FEATURES = [
  'Project Memory / decision history',
  'CEO Review',
  'Monitor Agent (hallucination/cost/drift detection)',
  'Autonomous Fix Engine',
  'Compliance reports',
  'Something else',
]

function FeedbackSurvey({ onSubmitted }: { onSubmitted: () => void }) {
  const { showToast } = useToast()
  const [rating, setRating] = useState(0)
  const [bestFeature, setBestFeature] = useState(FEATURES[0])
  const [improvement, setImprovement] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (rating === 0) {
      setError('Please pick a rating')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch('/api/v1/user/feedback', {
        method: 'POST',
        body: JSON.stringify({ rating, best_feature: bestFeature, improvement: improvement || null }),
      })
      showToast("Thanks for your feedback! We've extended your trial by 15 days. 🎉")
      onSubmitted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BentoCard className="mb-6">
      <p className="mb-1 text-sm font-semibold text-ink">How's Kavacha going?</p>
      <p className="mb-4 text-sm text-ink-dim">Three quick questions -- submitting extends your trial by 15 days.</p>
      {error && <p className="mb-3 text-sm text-bad">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-dim">How would you rate Kavacha?</label>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`text-2xl ${n <= rating ? 'text-saffron-bright' : 'text-ink-faint'}`}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-dim">What's the most valuable feature?</label>
          <select
            value={bestFeature}
            onChange={(e) => setBestFeature(e.target.value)}
            className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
          >
            {FEATURES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-dim">What's one thing we should improve?</label>
          <textarea
            rows={2}
            maxLength={1000}
            value={improvement}
            onChange={(e) => setImprovement(e.target.value)}
            className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit feedback'}
        </button>
      </form>
    </BentoCard>
  )
}

export function AccountStatusPanel() {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [showWaitlist, setShowWaitlist] = useState(false)

  function load() {
    apiFetch<AccountStatus>('/api/v1/user/account-status')
      .then(setStatus)
      .catch(() => setStatus(null))
  }

  useEffect(load, [])

  if (!status) return null

  return (
    <div className="mb-6">
      {status.status === 'trial' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-card p-4">
          <p className="text-sm text-ink-dim">
            <span className="font-medium text-ink">Trial:</span> {status.trial_days_left} day
            {status.trial_days_left === 1 ? '' : 's'} left
            {status.trial_extended && <span className="text-ink-faint"> (extended)</span>}
          </p>
          <button
            type="button"
            onClick={() => setShowWaitlist(true)}
            className="rounded-md border border-saffron-bright/40 px-3 py-1.5 text-sm font-medium text-saffron-bright hover:bg-saffron-bright/10"
          >
            Upgrade
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-card p-4">
          <p className="text-sm text-ink-dim">
            <span className="font-medium text-ink">Free tier:</span> {status.projects_used}/{status.project_limit}{' '}
            projects &middot; {status.events_used_this_month}/{status.events_limit} events this month
          </p>
          <button
            type="button"
            onClick={() => setShowWaitlist(true)}
            className="rounded-md gradient-bg px-3 py-1.5 text-sm font-medium text-surface"
          >
            Upgrade
          </button>
        </div>
      )}

      {status.survey_available && <FeedbackSurvey onSubmitted={load} />}

      {showWaitlist && <WaitlistModal source="dashboard_usage_panel" onClose={() => setShowWaitlist(false)} />}
    </div>
  )
}
