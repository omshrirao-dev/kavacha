import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-surface p-8 text-center text-ink-dim">Loading...</div>
  if (!session) return <Navigate to="/login" replace />

  return <>{children}</>
}
