import { analysisFromDashboard } from '../decisionModel'
import type {
  Dashboard,
  EvidenceItem,
  EvidenceVerification,
  PolicyResponse,
  SourceSnapshot,
} from '../types'

const source = (source_id: string, data_period: string): SourceSnapshot => ({
  source_id,
  status: 'LIVE',
  source_url: `https://example.org/${source_id}.json`,
  dataset_name: `測試來源 ${source_id}`,
  reference_url: `https://example.org/${source_id}`,
  data_period,
  fields_used: ['職業代碼', '測試數值'],
  why_used: '測試決策閱讀 adapter。',
  limitations: '僅供測試。',
  retrieved_at: '2026-09-13T01:00:00Z',
  content_sha256: `sha-${source_id}`,
  raw_rows: 10,
  normalized_rows: 3,
})

export const dashboardFixture: Dashboard = {
  analysis_run_id: 'run-live-1',
  published_at: '2026-09-13T01:00:00Z',
  overall_status: 'LIVE',
  sources: [
    source('dgbas_employment', '2025'),
    source('ilo_genai_exposure', '2025'),
    source('taiwanjobs', '2026-09-13'),
    source('job104_research', '2025'),
    source('mol_vacancy_history', '2023–2025'),
  ],
  summary_metrics: { score_version: 'metric-v1', metric_warning: '完整 Risk 尚未發布。' },
  occupation_signals: [{
    code: '4',
    name: '事務支援人員',
    youth_employed: 12_345,
    youth_employment_share: 0.2,
    occupation_share_of_youth: 0.1,
    exposure_level: 'gradient',
    exposure_score: 0.8,
    ai_entry_jobs: 12,
    total_entry_jobs: 120,
    ai_entry_opportunity_rate: 0.1,
    recruitment_yoy_change: -0.12,
    recruitment_weakening: 0.6,
    recruitment_vacancies_previous: 20_000,
    recruitment_vacancies_current: 17_600,
    structural_exposure_score: 40,
    complete_risk_score: undefined,
    score_status: 'MISSING_C',
    score_formula: '100 × sqrt(A × B)',
    data_confidence: 'MEDIUM',
    data_confidence_reasons: ['D 為平台樣本。'],
    priority: 'high',
    source_snapshot_ids: ['dgbas_employment', 'ilo_genai_exposure', 'taiwanjobs', 'mol_vacancy_history'],
  }],
  public_opinion: [],
  industry_context: [],
  cleaning_summary: {
    duplicates_removed: 0,
    expired_removed: 0,
    missing_occupation: 0,
    crosswalk_coverage: 1,
    unmatched_categories: [],
    transform_version: 'test-v1',
    before_after: [],
  },
  evidence_preview: [],
}

export const evidenceFixture: EvidenceItem = {
  evidence_id: 'ev-1',
  title: '青年就業政策研究',
  institution: 'ILO',
  authors: ['研究者'],
  published_at: '2025-01-01',
  evidence_type: '研究報告',
  authority_tier: 'A',
  method_summary: '任務分析',
  finding: '培訓應對準工作任務變化。',
  limitations: '不是臺灣政策成效估計。',
  url: 'https://example.org/research',
  retrieved_at: '2026-09-13T01:10:00Z',
  freshness: 'VERSIONED',
}

export const verificationFixture: EvidenceVerification = {
  verification_id: 'verify-1',
  analysis_run_id: 'run-live-1',
  status: 'COMPLETED',
  model_id: 'bedrock-test',
  verified_at: '2026-09-13T01:12:00Z',
  approved_evidence_ids: ['ev-1'],
  searched_candidates: [evidenceFixture],
  claims: [{
    claim_id: 'claim-1',
    evidence_id: 'ev-1',
    claim: '培訓設計應對準受 AI 影響的工作任務。',
    excerpt: 'A directly supporting source passage.',
    locator: '第 4 節',
    support: '直接支持',
    limitations: ['不是因果估計'],
    source_title: '青年就業政策研究',
    source_url: 'https://example.org/research',
    retrieved_url: 'https://example.org/research',
    authority_basis: '國際組織原始研究',
  }],
  gaps: [],
  agent_steps: ['SEARCHING', 'RETRIEVING', 'VERIFYING', 'COMPLETED'],
}

export function policyFixture(count = 1): PolicyResponse {
  return {
    generated_at: '2026-09-13T01:15:00Z',
    model_id: 'bedrock-test',
    analysis_run_id: 'run-live-1',
    is_fixture: false,
    warnings: [],
    options: Array.from({ length: count }, (_, index) => ({
      title: `測試政策 ${index + 1}`,
      target_group: '20–24 歲青年',
      problem: '工作任務快速改變。',
      mechanism: '以職務任務為單位提供訓練。',
      implementation: ['盤點任務', '試辦訓練'],
      kpis: [{ name: '完成率', target: '80%' }],
      evidence_ids: ['ev-1'],
      risks: ['雇主參與不足'],
      limitations: ['需先小規模驗證'],
    })),
  }
}

export function decisionFixture(policyCount = 1) {
  return analysisFromDashboard({
    dashboard: structuredClone(dashboardFixture),
    occupation: structuredClone(dashboardFixture.occupation_signals[0]),
    evidenceItems: [structuredClone(evidenceFixture)],
    verification: structuredClone(verificationFixture),
    policy: policyFixture(policyCount),
  })
}
