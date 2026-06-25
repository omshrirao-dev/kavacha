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

export interface RequirementIssue {
  requirement_reference: string
  gap_description: string
  severity: string
}

export interface CEOReviewResult {
  project_id: string
  approved: boolean
  summary: string
  issues: RequirementIssue[]
  memory_entry_id: string
  audit_log_id: string
}

export interface MonitorJobStatus {
  running: boolean
  next_run: string | null
}

export interface MonitorStatus {
  track_a: MonitorJobStatus
  track_b: MonitorJobStatus
  track_c: MonitorJobStatus
}

export interface CostIntelligence {
  project_id: string
  budget_usd: number | null
  over_budget: boolean
  total_cost_usd: number
  projected_monthly_usd: number
  days_elapsed: number
}

export interface FixPattern {
  issue_type: string
  root_cause_pattern: string
  fix_template: string
  success_rate: number
  project_count: number
  updated_at: string
}

export interface ComplianceReport {
  project_id: string
  generated_at: string
  gdpr_evidence: string[]
  dpdp_evidence: string[]
  soc2_evidence: string[]
  security_decision_history: { timestamp: string; stage: string; content: string }[]
  data_isolation_proof: string[]
  access_control_log_sample: { actor_id: string; action: string; outcome: string; created_at: string }[]
  access_control_log_total_entries: number
  disclaimer: string
  snapshot_id: string
}

export interface DashboardSummary {
  projects_monitored: number
  issues_today: number
  fixes_applied: number
  fix_success_rate: number | null
  patterns_learned: number
  cost_overruns_caught: number
  cost_overrun_inr_caught: number
  compliance_reports_ready: number
}

export interface DemoData {
  project: Project
  memory: MemoryEntry[]
  issues: Issue[]
  ceo_review: CEOReviewResult
  monitor_status: MonitorStatus
  cost_intelligence: CostIntelligence
  fix_patterns: FixPattern[]
  compliance_report: ComplianceReport
}
