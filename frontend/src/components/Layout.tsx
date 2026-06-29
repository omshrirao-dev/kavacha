import { useEffect, useRef, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function AvatarMenu() {
  const { session, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!session) return null
  const initial = (session.user.email ?? '?').charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full gradient-bg text-sm font-semibold text-surface"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-md border border-edge bg-card py-1 shadow-lg">
          <p className="truncate border-b border-edge px-3 py-2 text-xs text-ink-faint">{session.user.email}</p>
          <Link to="/settings" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink-dim hover:bg-surface-2 hover:text-ink">
            Account Settings
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className="block w-full px-3 py-2 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function Layout() {
  const { session } = useAuth()

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-edge bg-surface-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/dashboard" className="gradient-text text-lg font-bold">
            Kavacha
          </Link>
          {session && (
            <div className="flex items-center gap-4 text-sm text-ink-dim">
              <Link to="/dashboard" className="hidden hover:text-ink sm:inline">
                Dashboard
              </Link>
              <Link to="/demo" className="hidden hover:text-ink sm:inline">
                Live Demo
              </Link>
              <Link to="/projects/new" className="rounded-md gradient-bg px-3 py-1.5 text-sm font-medium text-surface">
                + Add Project
              </Link>
              <AvatarMenu />
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
          <Link to="/overview" className="hover:text-ink-dim">
            Overview
          </Link>
        </div>
      </footer>
    </div>
  )
}
