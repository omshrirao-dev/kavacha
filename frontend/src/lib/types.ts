export type HealthStatus = 'green' | 'yellow' | 'red'

export interface Project {
  id: string
  name: string
  status: string
  created_at: string
  health: HealthStatus
}

export interface MemoryEntry {
  id: string
  stage: string
  layer: string | null
  content: string
  decision_type: string | null
  impact_level: string | null
  timestamp: string
  source: string
}

export interface MemorySearchResult extends MemoryEntry {
  project_id: string
  similarity_score: number
}

export interface Issue {
  id: string
  detected_at: string
  type: string
  severity: string
  description: string
  root_cause: string | null
  fix_applied: boolean
  verified: boolean
  time_to_resolve_mins: number | null
}
