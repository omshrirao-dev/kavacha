import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProjectHeader } from '../components/ProjectHeader'
import { ProjectTabs } from '../components/ProjectTabs'
import { Spinner } from '../components/Spinner'
import { BentoCard } from '../components/ui/BentoCard'
import { ApiError, apiFetch } from '../lib/api'
import type { MemoryEntry, MemorySearchResult } from '../lib/types'

function MemoryCard({ entry }: { entry: MemoryEntry | MemorySearchResult }) {
  return (
    <BentoCard>
      <div className="mb-2 flex items-center gap-2 text-xs text-ink-faint">
        <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-ink-dim">{entry.stage}</span>
        {entry.layer && <span className="rounded bg-surface-2 px-2 py-0.5 text-ink-dim">{entry.layer}</span>}
        {entry.impact_level && <span className="rounded bg-surface-2 px-2 py-0.5 text-ink-dim">{entry.impact_level} impact</span>}
        {'similarity_score' in entry && (
          <span className="rounded bg-saffron/10 px-2 py-0.5 text-saffron-bright">
            {(entry.similarity_score * 100).toFixed(0)}% match
          </span>
        )}
        <span className="ml-auto">{new Date(entry.timestamp).toLocaleString()}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink">{entry.content}</p>
    </BentoCard>
  )
}

export function ProjectMemoryPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MemorySearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    apiFetch<MemoryEntry[]>(`/api/v1/projects/${projectId}/memory`)
      .then(setEntries)
      .catch((err: ApiError) => setError(err.message))
  }, [projectId])

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!projectId || !query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const results = await apiFetch<MemorySearchResult[]>(
        `/api/v1/projects/${projectId}/memory/search?q=${encodeURIComponent(query)}`,
      )
      setSearchResults(results)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  if (!projectId) return null

  return (
    <div>
      <ProjectHeader projectId={projectId} />
      <ProjectTabs projectId={projectId} />
      <p className="mb-6 text-sm text-ink-dim">The Brain -- every architectural decision, and why it was made.</p>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask why a decision was made, e.g. 'why this database'"
          className="flex-1 rounded-md border border-edge bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron/40"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-md gradient-bg px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
        {searchResults && (
          <button
            type="button"
            onClick={() => setSearchResults(null)}
            className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:border-saffron-bright"
          >
            Clear
          </button>
        )}
      </form>

      {error && <ErrorBanner message={error} />}

      <div className="space-y-3">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="text-ink-faint">No matching decisions found.</p>
          ) : (
            searchResults.map((r) => <MemoryCard key={r.id} entry={r} />)
          )
        ) : entries === null ? (
          <Spinner label="Loading memory..." />
        ) : entries.length === 0 ? (
          <p className="text-ink-faint">No decisions recorded for this project yet.</p>
        ) : (
          entries.map((e) => <MemoryCard key={e.id} entry={e} />)
        )}
      </div>
    </div>
  )
}
