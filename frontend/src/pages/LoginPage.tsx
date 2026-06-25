import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { session, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const message = await login(email, password)
    setSubmitting(false)
    if (message) setError(message)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-edge bg-card p-8">
        <h1 className="text-xl font-semibold text-ink">Sign in to Kavacha</h1>
        {error && <p className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-ink-dim">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-dim">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md gradient-bg px-3 py-2 text-sm font-medium text-surface disabled:opacity-50"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="flex justify-center gap-3 text-xs text-ink-faint">
          <Link to="/privacy" className="hover:text-ink-dim">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-ink-dim">
            Terms of Service
          </Link>
        </p>
      </form>
    </div>
  )
}
