import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LandingPage } from '../pages/LandingPage'

// "/" means different things depending on who's looking: the public pitch
// for an anonymous visitor, a redirect straight into the real dashboard for
// someone already signed in. Splitting these into two routes (one public,
// one behind ProtectedRoute) would mean a flash of the wrong page while
// session state resolves on every load -- deciding here avoids that.
export function HomeRoute() {
  const { session, loading } = useAuth()

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-surface text-ink-dim">Loading...</div>
  if (session) return <Navigate to="/dashboard" replace />
  return <LandingPage />
}
