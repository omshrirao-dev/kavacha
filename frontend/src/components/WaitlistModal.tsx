import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { ApiError, apiFetch } from '../lib/api'

export function WaitlistModal({ source, onClose }: { source: string; onClose: () => void }) {
  const { session } = useAuth()
  const [email, setEmail] = useState(session?.user.email ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch('/api/v1/waitlist', { method: 'POST', body: JSON.stringify({ email, source }) })
      setJoined(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to join waitlist')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-edge bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-lg font-semibold text-ink">🚀 Upgrade to Kavacha Pro</p>
        <p className="mb-4 text-sm text-ink-dim">We're currently in early access. Paid plans are coming soon.</p>

        {joined ? (
          <div className="rounded-md border border-ok/40 bg-ok/5 p-4 text-sm text-ink">
            You're on the list -- we'll email you when paid plans launch.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-ink-dim">Want early access when we launch?</p>
            {error && <p className="text-sm text-bad">{error}</p>}
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
              >
                {submitting ? 'Joining...' : 'Notify Me'}
              </button>
            </div>
            <div className="rounded-md border border-edge bg-surface-2 p-3 text-sm text-ink-dim">
              <p className="mb-1 font-medium text-ink">As an early supporter, you'll get:</p>
              <ul className="space-y-0.5">
                <li>✓ 30% off your first 3 months</li>
                <li>✓ Priority support</li>
                <li>✓ Input on our roadmap</li>
              </ul>
            </div>
          </form>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:border-saffron-bright"
        >
          Close
        </button>
      </div>
    </div>
  )
}
