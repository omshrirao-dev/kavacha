import { useState, type FormEvent } from 'react'
import { BentoCard } from '../components/ui/BentoCard'
import { useToast } from '../context/ToastContext'
import { ApiError, apiFetch } from '../lib/api'

function BugReportForm() {
  const { showToast } = useToast()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch('/api/v1/support/bug-report', { method: 'POST', body: JSON.stringify({ subject, description }) })
      showToast('Bug report sent -- we read every one')
      setSubject('')
      setDescription('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-bad">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-ink-dim">Subject</label>
        <input
          required
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-dim">Description</label>
        <textarea
          required
          rows={4}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
      >
        {submitting ? 'Sending...' : 'Submit'}
      </button>
    </form>
  )
}

function ProjectAdditionForm() {
  const { showToast } = useToast()
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await apiFetch('/api/v1/support/project-addition', { method: 'POST', body: JSON.stringify({ details }) })
      showToast("Request sent -- we'll email you when it's added")
      setDetails('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-bad">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-ink-dim">Project details</label>
        <textarea
          required
          rows={4}
          maxLength={2000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="What's the project, what AI stack does it use, and what should we set up for you?"
          className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:border-saffron-bright disabled:opacity-50"
      >
        {submitting ? 'Sending...' : 'Request addition'}
      </button>
    </form>
  )
}

export function SupportPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-xl font-semibold text-ink">💬 Kavacha Support</h1>
      <p className="mb-6 text-sm text-ink-dim">We're a small team building something big. We personally read every message.</p>

      <BentoCard className="mb-4">
        <p className="mb-1 text-sm font-semibold text-ink">📧 Email us</p>
        <p className="text-sm text-ink-dim">
          <a href="mailto:support@kavacha.dev" className="text-saffron-bright hover:underline">
            support@kavacha.dev
          </a>
        </p>
      </BentoCard>

      <BentoCard className="mb-4">
        <p className="mb-3 text-sm font-semibold text-ink">📝 Report a bug</p>
        <BugReportForm />
      </BentoCard>

      <BentoCard className="mb-4">
        <p className="mb-1 text-sm font-semibold text-ink">Request a project addition</p>
        <p className="mb-3 text-sm text-ink-dim">
          Want the Kavacha team to manually set up your project for you? Tell us about it below.
        </p>
        <ProjectAdditionForm />
      </BentoCard>
    </div>
  )
}
