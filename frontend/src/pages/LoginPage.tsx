import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { redirectAfterLogin } from '../lib/postLoginRoute'
import { supabase } from '../lib/supabase'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}

export function LoginPage() {
  const { session, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const message = await login(email, password)
    setSubmitting(false)
    if (message) {
      setError(message)
      return
    }
    await redirectAfterLogin(navigate)
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)
    // No projects-vs-dashboard check here -- Google's redirect leaves and
    // comes back to a fresh page load, so that one-time routing decision is
    // made by /auth/callback (AuthCallbackPage) instead, after the redirect.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) {
      setError(oauthError.message)
      setGoogleLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-edge bg-card p-8">
        <h1 className="text-xl font-semibold text-ink">Sign in to Kavacha</h1>
        {error && <p className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-edge bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <GoogleIcon />
          {googleLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-edge" />
          <span className="text-xs text-ink-faint">or continue with email</span>
          <div className="h-px flex-1 bg-edge" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
        </form>

        <p className="flex justify-center gap-3 text-xs text-ink-faint">
          <Link to="/privacy" className="hover:text-ink-dim">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-ink-dim">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  )
}
