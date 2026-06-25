import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout() {
  const { session, logout } = useAuth()

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-edge bg-surface-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="text-lg font-semibold text-ink">
            Kavacha
          </Link>
          {session && (
            <div className="flex items-center gap-4 text-sm text-ink-dim">
              <span>{session.user.email}</span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-edge px-3 py-1.5 hover:border-saffron-bright hover:text-ink"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-edge bg-surface-2">
        <div className="mx-auto flex max-w-6xl gap-4 px-6 py-4 text-xs text-ink-faint">
          <Link to="/privacy" className="hover:text-ink-dim">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-ink-dim">
            Terms of Service
          </Link>
        </div>
      </footer>
    </div>
  )
}
