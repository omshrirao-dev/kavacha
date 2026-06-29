import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { redirectAfterLogin } from '../lib/postLoginRoute'

const TIMEOUT_MS = 8000

// Google's redirectTo lands here (not directly on /dashboard) specifically
// so the one-time "no projects -> onboarding" check can run after the OAuth
// round trip completes -- supabase-js parses the access/refresh tokens out
// of the URL fragment as part of its own initialization, which AuthContext's
// `loading` already waits on, so `session` here reflects the freshly
// established login.
export function AuthCallbackPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (loading) return
    if (session) {
      redirectAfterLogin(navigate)
      return
    }
    const id = setTimeout(() => setTimedOut(true), TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [loading, session, navigate])

  if (timedOut) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-8 text-center">
        <ErrorBanner message="Google sign-in didn't complete. Please try again." />
        <Link to="/login" className="text-sm text-saffron-bright hover:text-saffron-deep">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <Spinner label="Finishing sign-in..." />
    </div>
  )
}
