import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('does not replace a missing dashboard with fixture metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ detail: 'dashboard_not_ready' }),
    }))

    render(<App />)

    expect(await screen.findByRole('heading', { name: '青年 AI 就業風險' })).toBeInTheDocument()
    expect(screen.getByText('NO FIXTURE / NO PRETEND DATA')).toBeInTheDocument()
  })

  it('explains source freshness and cleaning provenance without opening the raw endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        analysis_run_id: 'run_test',
        published_at: '2026-09-12T07:00:00Z',
        overall_status: 'LIVE',
        sources: [{
          source_id: 'dgbas_employment',
          status: 'UNCHANGED',
          source_url: 'https://example.com/raw.xlsx',
          dataset_name: '主計總處表 47',
          reference_url: 'https://example.com/about',
          fields_used: ['欄 O：20–24 歲就業人數', '欄 Q：25–29 歲就業人數'],
          why_used: '建立主分析族群與比較組。',
          limitations: '職業大類資料不能解讀為失業人數。',
          input_count_label: '個選定職業列',
          output_count_label: '個 20–24 歲職業指標',
          processing_steps: ['擷取 20–24 與 25–29 歲'],
          retrieved_at: '2026-09-12T07:00:00Z',
          http_status: 200,
          content_sha256: 'abcdef1234567890',
          raw_rows: 7,
          normalized_rows: 7,
        }],
        summary_metrics: {
          youth_employed_20_24: 10,
          youth_employed_25_29: 12,
          youth_employed_20_29: 22,
          youth_ai_exposure_load: 0.1,
        },
        occupation_signals: [{
          code: '4',
          name: '事務支援人員',
          youth_employed: 10,
          youth_employed_25_29: 12,
          youth_employment_share: 1,
          exposure_level: 'gradient',
          exposure_score: 0.5,
          ai_entry_jobs: 0,
          total_entry_jobs: 1,
          ai_entry_opportunity_rate: 0,
          youth_concentration_index: 1,
          opportunity_gap: 1,
          transformation_priority_score: 79.4,
          score_formula: '100 × cubic_root(A × B × H)',
          priority: 'high',
          source_snapshot_ids: ['dgbas_employment'],
        }],
        public_opinion: [{
          label: '20–29歲就業網路族認為工作可能被自動化／AI取代',
          value: 39.5,
          unit: '%',
          survey_year: 2024,
        }],
        industry_context: [],
        cleaning_summary: {
          duplicates_removed: 0,
          expired_removed: 0,
          missing_occupation: 0,
          crosswalk_coverage: 1,
          unmatched_categories: [],
          transform_version: 'test.1',
          before_after: [],
        },
        evidence_preview: [],
      }),
    }))

    render(<App />)

    expect((await screen.findAllByText(/主計總處／20–24 歲就業結構/)).length).toBeGreaterThan(0)
    expect(screen.getByText('AI 轉型優先度')).toBeInTheDocument()
    expect(screen.getAllByText(/79.4/).length).toBeGreaterThan(0)
    expect(screen.getByText('建立主分析族群與比較組。')).toBeInTheDocument()
    expect(screen.getByText('職業大類資料不能解讀為失業人數。')).toBeInTheDocument()
    expect(screen.getByText('查看來源說明頁 ↗')).toHaveAttribute(
      'href',
      'https://example.com/about',
    )
    expect(screen.queryByRole('link', { name: /原始/ })).not.toBeInTheDocument()
  })

  it('runs the authority agent before enabling policy generation', async () => {
    const fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/v1/evidence/verify')) return Promise.resolve({
        ok: true,
        json: async () => ({
          verification_id: 'verify_test', analysis_run_id: 'run_test', status: 'COMPLETED',
          model_id: 'test-model', verified_at: '2026-09-12T07:00:00Z',
          approved_evidence_ids: ['ev_1'],
          searched_candidates: [{ evidence_id: 'ev_1', title: 'ILO report', institution: 'ILO', authors: [], published_at: '2025', evidence_type: 'international report', authority_tier: 'A', method_summary: 'Task analysis', finding: 'AI changes tasks', limitations: 'Not causal', url: 'https://ilo.org/report', retrieved_at: '2026-09-12T07:00:00Z', freshness: 'VERSIONED' }],
          gaps: [],
          agent_steps: ['SEARCHING', 'RETRIEVING', 'VERIFYING', 'COMPLETED'],
          claims: [{ claim_id: 'claim-1', evidence_id: 'ev_1', claim: 'AI 主要改變工作任務。', excerpt: 'A directly supporting source passage.', locator: 'HTML block 2', support: 'direct', limitations: [], source_title: 'ILO report', source_url: 'https://ilo.org/report' }],
        }),
      })
      return Promise.resolve({
        ok: true,
        json: async () => ({
          analysis_run_id: 'run_test', published_at: '2026-09-12T07:00:00Z', overall_status: 'LIVE', sources: [], summary_metrics: {},
          occupation_signals: [{ code: '4', name: '事務支援人員', youth_employed: 10, youth_employment_share: 1, exposure_level: 'high', exposure_score: 0.5, ai_entry_jobs: 0, total_entry_jobs: 1, ai_entry_opportunity_rate: 0, youth_concentration_index: 1, opportunity_gap: 1, transformation_priority_score: 79.4, score_formula: 'formula', priority: 'high', source_snapshot_ids: [] }],
          public_opinion: [], industry_context: [], cleaning_summary: { duplicates_removed: 0, expired_removed: 0, missing_occupation: 0, unmatched_categories: [], transform_version: 'test', before_after: [] },
          evidence_preview: [{ evidence_id: 'ev_1', title: 'ILO report', institution: 'ILO', authors: [], published_at: '2025', evidence_type: 'international report', authority_tier: 'A', method_summary: 'Task analysis', finding: 'AI changes tasks', limitations: 'Not causal', url: 'https://ilo.org/report', retrieved_at: '2026-09-12T07:00:00Z', freshness: 'VERSIONED' }],
        }),
      })
    })
    vi.stubGlobal('fetch', fetch)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '執行權威證據 Agent' }))

    expect(await screen.findByText('AI 主要改變工作任務。')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/v1/evidence/verify', expect.objectContaining({ method: 'POST' }))
    expect(screen.getByRole('button', { name: '產生三個政策選項' })).toBeEnabled()
  })
})
