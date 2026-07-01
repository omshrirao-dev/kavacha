import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ApiError, apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'

interface Profile {
  id: string
  email: string | null
  display_name: string | null
}

export function AccountSettingsPage() {
  const { session, logout } = useAuth()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [revokingSessions, setRevokingSessions] = useState(false)

  const isGoogleUser = session?.user.app_metadata?.provider === 'google'

  useEffect(() => {
    apiFetch<Profile>('/api/v1/user/profile')
      .then((p) => {
        setProfile(p)
        setDisplayName(p.display_name ?? '')
      })
      .catch((err: ApiError) => setError(err.message))
  }, [])

  async function handleSaveName(e: FormEvent) {
    e.preventDefault()
    setSavingName(true)
    setError(null)
    try {
      await apiFetch('/api/v1/user/profile', { method: 'PUT', body: JSON.stringify({ display_name: displayName }) })
      showToast('Settings saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save')
    } finally {
      setSavingName(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setSavingPassword(true)
    setError(null)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw new Error(updateError.message)
      setNewPassword('')
      showToast('Password updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleRevokeAllSessions() {
    setRevokingSessions(true)
    setError(null)
    try {
      await apiFetch('/api/v1/user/sessions/revoke-all', { method: 'POST' })
      showToast('Logged out of all devices')
      await logout()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke sessions')
      setRevokingSessions(false)
    }
  }

  async function handleDeleteAccount() {
    if (!profile?.email || deleteConfirmEmail !== profile.email) return
    setDeleting(true)
    setError(null)
    try {
      await apiFetch('/api/v1/user/account', {
        method: 'DELETE',
        body: JSON.stringify({ email_confirmation: deleteConfirmEmail }),
      })
      await logout()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete account')
      setDeleting(false)
    }
  }

  if (!profile) {
    return <div className="mx-auto max-w-lg">{error ? <ErrorBanner message={error} /> : <Spinner label="Loading account..." />}</div>
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold text-ink">Account Settings</h1>
      {error && <ErrorBanner message={error} />}

      <BentoCard className="mb-4">
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-dim">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-dim">Email</label>
            <p className="mt-1 rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm text-ink-dim">{profile.email}</p>
          </div>
          <button
            type="submit"
            disabled={savingName}
            className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
          >
            {savingName ? 'Saving...' : 'Save'}
          </button>
        </form>
      </BentoCard>

      <BentoCard className="mb-4">
        <p className="mb-1 text-sm font-medium text-ink">Notification preferences</p>
        <p className="text-sm text-ink-dim">
          Alerts are configured per-project -- open a project's <span className="text-ink">Settings</span> tab to set its notification
          email or turn alerts off.
        </p>
      </BentoCard>

      {!isGoogleUser && (
        <BentoCard className="mb-4">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-dim">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:border-saffron-bright disabled:opacity-50"
            >
              {savingPassword ? 'Updating...' : 'Change password'}
            </button>
          </form>
        </BentoCard>
      )}

      <BentoCard className="mb-4">
        <p className="mb-1 text-sm font-medium text-ink">Sessions</p>
        <p className="mb-3 text-sm text-ink-dim">
          Signs you out everywhere -- use this if you don't recognize a "new login" alert email, or think a device may
          be compromised.
        </p>
        <button
          type="button"
          onClick={handleRevokeAllSessions}
          disabled={revokingSessions}
          className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:border-saffron-bright disabled:opacity-50"
        >
          {revokingSessions ? 'Logging out everywhere...' : 'Log out of all devices'}
        </button>
      </BentoCard>

      <BentoCard className="border-bad/30">
        <p className="mb-1 text-sm font-semibold text-bad">Delete account</p>
        <p className="mb-3 text-sm text-ink-dim">
          Permanently deletes every project you own and your Kavacha account. This cannot be undone.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={deleteConfirmEmail}
            onChange={(e) => setDeleteConfirmEmail(e.target.value)}
            placeholder={`Type "${profile.email}" to confirm`}
            className="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-bad focus:outline-none focus:ring-1 focus:ring-bad/40"
          />
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deleteConfirmEmail !== profile.email || deleting}
            className="rounded-md border border-bad/40 px-4 py-2 text-sm font-medium text-bad hover:bg-bad/10 disabled:opacity-40"
          >
            {deleting ? 'Deleting...' : 'Delete account'}
          </button>
        </div>
      </BentoCard>

      <Link to="/dashboard" className="mt-4 block text-sm text-ink-faint hover:text-ink-dim">
        &larr; Back to dashboard
      </Link>
    </div>
  )
}
