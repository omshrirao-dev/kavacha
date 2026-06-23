import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { ProjectTabs } from '../components/ProjectTabs'
import { ApiError, apiFetch } from '../lib/api'
import type { MemoryEntry, MemorySearchResult } from '../lib/types'

function MemoryCard({ entry }: { entry: MemoryEntry | MemorySearchResult }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
        <span className="rounded bg-gray-100 px-2 py-0.5 font-medium">{entry.stage}</span>
        {entry.layer && <span className="rounded bg-gray-100 px-2 py-0.5">{entry.layer}</span>}
        {entry.impact_level && <span className="rounded bg-gray-100 px-2 py-0.5">{entry.impact_level} impact</span>}
        {'similarity_score' in entry && (
          <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
            {(entry.similarity_score * 100).toFixed(0)}% match
          </span>
        )}
        <span className="ml-auto">{new Date(entry.timestamp).toLocaleString()}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-gray-800">{entry.content}</p>
    </div>
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

  if (!projectId) return null;

  return (
    <div>
      <ProjectTabs projectId={projectId} />
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Project Memory</h1>
      <p className="mb-6 text-sm text-gray-500">Every architectural decision, and why it was made.</p>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask why a decision was made, e.g. 'why this database'"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
        {searchResults && (
          <button
            type="button"
            onClick={() => setSearchResults(null)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </form>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      <div className="space-y-3">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="text-gray-500">No matching decisions found.</p>
          ) : (
            searchResults.map((r) => <MemoryCard key={r.id} entry={r} />)
          )
        ) : entries === null ? (
          <p className="text-gray-500">Loading memory...</p>
        ) : entries.length === 0 ? (
          <p className="text-gray-500">No decisions recorded for this project yet.</p>
        ) : (
          entries.map((e) => <MemoryCard key={e.id} entry={e} />)
        )}
      </div>
    </div>
  )
}
