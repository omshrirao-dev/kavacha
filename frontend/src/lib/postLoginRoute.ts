import type { NavigateFunction } from 'react-router-dom'
import { apiFetch } from './api'
import type { Project } from './types'

// Runs exactly once, right after a login action completes (email/password
// in LoginPage, or Google OAuth via AuthCallbackPage) -- not a permanent
// dashboard guard. A user who lands back on /dashboard later with zero
// projects (e.g. they hit "Skip for now") sees that page's own empty state
// instead of being bounced to onboarding forever.
export async function redirectAfterLogin(navigate: NavigateFunction): Promise<void> {
  try {
    const projects = await apiFetch<Project[]>('/api/v1/projects')
    navigate(projects.length === 0 ? '/onboarding' : '/dashboard', { replace: true })
  } catch {
    navigate('/dashboard', { replace: true })
  }
}
