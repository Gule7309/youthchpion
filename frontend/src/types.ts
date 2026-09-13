export type Freshness = 'LIVE' | 'UNCHANGED' | 'CACHED' | 'STALE' | 'VERSIONED' | 'FAILED'

export interface SourceSnapshot {
  source_id: string
  status: Freshness
  source_url: string
  dataset_name?: string
  reference_url?: string
  discovery_url?: string
  data_period?: string
  fields_used?: string[]
  why_used?: string
  limitations?: string
  input_count_label?: string
  output_count_label?: string
  processing_steps?: string[]
  retrieved_at: string
  source_published_at?: string
  http_status?: number
  content_sha256?: string
  raw_rows: number
  normalized_rows: number
  message?: string
}

export interface OccupationSignal {
  code: string
  name: string
  youth_employed?: number
  youth_employed_18_24?: number
  youth_employed_20_24?: number
  youth_employed_25_29?: number
  youth_employed_30_35?: number
  youth_employed_18_35?: number
  youth_employment_share?: number
  occupation_share_of_youth?: number
  exposure_level: string
  exposure_score?: number
  exposure_p90?: number
  high_exposure_occupation_share?: number
  exposure_occupation_count?: number
  ai_entry_jobs: number
  total_entry_jobs: number
  ai_entry_opportunity_rate?: number
  ai_entry_opportunity_status?: 'READY_EXPERIMENTAL' | 'LOW_SAMPLE' | 'LOW_AI_MAPPING_COVERAGE' | 'NO_DENOMINATOR'
  ai_subsample_mapping_coverage?: number
  recruitment_vacancies_current?: number
  recruitment_vacancies_previous?: number
  recruitment_yoy_change?: number
  recruitment_three_year_change?: number
  recruitment_weakening?: number
  weakening_sensitivity?: Record<string, number | undefined>
  youth_concentration_index?: number
  opportunity_gap?: number
  transformation_priority_score?: number
  structural_exposure_score?: number
  score_status?: 'EXPERIMENTAL' | 'INSUFFICIENT_DATA' | 'MISSING_C'
  score_formula: string
  data_confidence?: 'MEDIUM' | 'LOW'
  data_confidence_reasons?: string[]
  priority: 'high' | 'medium' | 'monitor'
  source_snapshot_ids: string[]
  source_snapshot_refs?: Array<{
    source_id: string
    run_id: string
    snapshot_key?: string
    content_sha256?: string
    data_period?: string
  }>
}

export interface EvidenceItem {
  evidence_id: string
  title: string
  institution: string
  authors: string[]
  published_at?: string
  evidence_type: string
  evidence_role?: 'PROBLEM_CONTEXT' | 'EXPOSURE_METHOD' | 'INTERVENTION_EFFECT' | 'OUTCOME_MONITORING' | 'PUBLIC_OPINION' | 'BACKGROUND'
  evaluation_design?: 'DESCRIPTIVE' | 'OUTCOME_MONITORING' | 'EVIDENCE_SYNTHESIS' | 'QUASI_EXPERIMENTAL' | 'RANDOMIZED' | 'NOT_ASSESSED'
  authority_tier: 'A' | 'B' | 'C' | 'D'
  method_summary?: string
  finding?: string
  limitations?: string
  doi?: string
  url: string
  retrieved_at: string
  freshness: Freshness
  discovery_source?: 'curated' | 'openalex' | 'crossref' | 'unknown'
}

export interface CleaningAudit {
  duplicates_removed: number
  expired_removed: number
  missing_occupation: number
  crosswalk_coverage?: number
  unmatched_categories: string[]
  transform_version: string
  before_after: Array<{ before: string; after: string }>
}

export interface Dashboard {
  analysis_run_id: string
  published_at: string
  overall_status: Freshness
  sources: SourceSnapshot[]
  summary_metrics: Record<string, unknown>
  occupation_signals: OccupationSignal[]
  public_opinion: Array<Record<string, unknown>>
  industry_context: Array<Record<string, unknown>>
  cleaning_summary: CleaningAudit
  evidence_preview: EvidenceItem[]
}

export interface PolicyOption {
  title: string
  target_group: string
  problem: string
  mechanism: string
  implementation: string[]
  kpis: Array<{ name: string; target: string }>
  evidence_ids: string[]
  risks: string[]
  limitations: string[]
}

export interface PolicyResponse {
  generated_at: string
  model_id: string
  analysis_run_id: string
  options: PolicyOption[]
  warnings: string[]
  is_fixture: boolean
}

export interface VerifiedClaim {
  claim_id: string
  evidence_id: string
  claim: string
  excerpt: string
  locator: string
  support: string
  limitations: string[]
  source_title: string
  source_url: string
  retrieved_url?: string
  content_sha256?: string
  authority_basis?: string
  geographic_scope: string
  taiwan_applicability: 'DIRECT_TAIWAN_CONTEXT' | 'TRANSFER_REQUIRES_LOCAL_VALIDATION' | 'BACKGROUND_ONLY'
  applicability_reason: string
  local_validation_needed: string[]
}

export interface TaiwanApplicabilityAssessment {
  status: 'TAIWAN_CONTEXT_WITH_LOCAL_INTERVENTION' | 'TAIWAN_CONTEXT_WITH_LOCAL_OUTCOME_MONITORING' | 'TAIWAN_CONTEXT_WITH_TRANSFER_EVIDENCE' | 'INSUFFICIENT_TAIWAN_CONTEXT'
  occupation_code?: string
  occupation_name?: string
  taiwan_problem_context_supported: boolean
  taiwan_intervention_effect_supported: boolean
  taiwan_local_outcome_monitoring_supported?: boolean
  local_context_source_ids: string[]
  local_research_evidence_ids: string[]
  local_outcome_evidence_ids?: string[]
  transfer_evidence_ids: string[]
  conclusion: string
  required_local_validation: string[]
}

export interface EvidenceHarnessSummary {
  schema_version: string
  prompt_version: string
  searched_candidates: number
  selected_sources: number
  retrieved_sources: number
  model_calls: number
  approved_claims: number
  rejected_sources: number
  input_tokens: number
  output_tokens: number
  duration_ms: number
  max_sources: number
  max_passages_per_source: number
  deadline_seconds: number
}

export interface EvidenceVerification {
  verification_id: string
  analysis_run_id: string
  status: 'COMPLETED' | 'PARTIAL'
  model_id: string
  verified_at: string
  approved_evidence_ids: string[]
  searched_candidates: EvidenceItem[]
  claims: VerifiedClaim[]
  gaps: string[]
  agent_steps: string[]
  harness?: EvidenceHarnessSummary
  taiwan_applicability: TaiwanApplicabilityAssessment
}
