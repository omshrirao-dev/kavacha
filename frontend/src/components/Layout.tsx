import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout() {
  const { session, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold text-gray-900">
            Kavacha
          </Link>
          {session && (
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{session.user.email}</span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-100"
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
    </div>
  )
}
