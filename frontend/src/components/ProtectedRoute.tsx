import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>
  if (!session) return <Navigate to="/login" replace />

  return <>{children}</>
}
