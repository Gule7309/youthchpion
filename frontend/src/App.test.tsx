import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { dashboardFixture } from './test/decisionFixtures'

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('does not replace a missing dashboard with fixture metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ detail: 'dashboard_not_ready' }),
    }))

    render(<App />)

    expect(await screen.findByRole('heading', { name: '青年 AI 就業轉型雷達' })).toBeInTheDocument()
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
          occupation_share_of_youth: 1,
          exposure_level: 'gradient',
          exposure_score: 0.5,
          ai_entry_jobs: 0,
          total_entry_jobs: 1,
          ai_entry_opportunity_rate: 0,
          youth_concentration_index: 1,
          opportunity_gap: 1,
          transformation_priority_score: 79.4,
          structural_exposure_score: 70.7,
          score_status: 'EXPERIMENTAL',
          score_formula: '100 × sqrt(A × B)',
          priority: 'high',
          source_snapshot_ids: ['dgbas_employment'],
        }],
        public_opinion: [{
          label: '20–29歲就業網路族認為工作可能被自動化／AI取代',
          value: 35.0,
          unit: '%',
          survey_year: 2025,
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
    expect(screen.getByText('政策關注指數')).toBeInTheDocument()
    expect(screen.getAllByText(/70.7/).length).toBeGreaterThan(0)
    expect(screen.getByText('建立主分析族群與比較組。')).toBeInTheDocument()
    expect(screen.getByText('職業大類資料不能解讀為失業人數。')).toBeInTheDocument()
    expect(screen.getByText(/查看來源說明頁/)).toHaveAttribute(
      'href',
      'https://example.com/about',
    )
    expect(screen.queryByRole('link', { name: /原始/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '排名' }))
    const attentionCard = screen.getByText('青年 AI 轉型政策關注指數').closest('.policy-risk')
    expect(attentionCard).not.toBeNull()
    expect(within(attentionCard as HTMLElement).getByText('70.7')).toBeInTheDocument()
    expect(attentionCard).not.toHaveTextContent('資料不足，暫不評分')
  })

  it('shows exact 18–35 only when the backend snapshot declares it', async () => {
    const dashboard = structuredClone(dashboardFixture)
    dashboard.sources.push({
      ...dashboard.sources[0],
      source_id: 'dgbas_microdata_18_35',
      dataset_name: '主計總處人力資源調查個體資料（加權彙總）',
    })
    dashboard.summary_metrics = {
      ...dashboard.summary_metrics,
      analysis_population_label: '18–35 歲',
      analysis_population_exact: true,
      analysis_population_source_id: 'dgbas_microdata_18_35',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => dashboard,
    }))

    render(<App />)

    expect(await screen.findByText(/精確個體資料加權 18–35 歲/)).toBeInTheDocument()
    expect(screen.getByText(/該職業內 18–35 歲占比/)).toBeInTheDocument()
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
          claims: [{ claim_id: 'claim-1', evidence_id: 'ev_1', claim: 'AI 主要改變工作任務。', excerpt: 'A directly supporting source passage.', locator: 'HTML block 2', support: 'direct', limitations: [], source_title: 'ILO report', source_url: 'https://ilo.org/report', retrieved_url: 'https://ilo.org/report', content_sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', authority_basis: 'allowlisted international organization', geographic_scope: '國際／跨國', taiwan_applicability: 'TRANSFER_REQUIRES_LOCAL_VALIDATION', applicability_reason: '可支撐作用機制，但不能直接證明台灣青年成效。', local_validation_needed: ['台灣試辦'] }],
          taiwan_applicability: { status: 'TAIWAN_CONTEXT_WITH_TRANSFER_EVIDENCE', occupation_code: '4', occupation_name: '事務支援人員', taiwan_problem_context_supported: true, taiwan_intervention_effect_supported: false, local_context_source_ids: ['dgbas_employment'], local_research_evidence_ids: [], transfer_evidence_ids: ['ev_1'], conclusion: '台灣問題存在，但介入成效主要來自國際證據。', required_local_validation: ['執行 90 天台灣試辦'] },
          harness: { schema_version: '1.0', prompt_version: 'test-v1', searched_candidates: 1, selected_sources: 1, retrieved_sources: 1, model_calls: 1, approved_claims: 1, rejected_sources: 0, input_tokens: 100, output_tokens: 20, duration_ms: 50, max_sources: 3, max_passages_per_source: 12, deadline_seconds: 90 },
        }),
      })
      return Promise.resolve({
        ok: true,
        json: async () => ({
          analysis_run_id: 'run_test', published_at: '2026-09-12T07:00:00Z', overall_status: 'LIVE', sources: [], summary_metrics: {},
          occupation_signals: [{ code: '4', name: '事務支援人員', youth_employed: 10, youth_employment_share: 1, occupation_share_of_youth: 1, exposure_level: 'high', exposure_score: 0.5, ai_entry_jobs: 0, total_entry_jobs: 1, ai_entry_opportunity_rate: 0, recruitment_weakening: 0.5, recruitment_yoy_change: -0.1, transformation_priority_score: 70.7, structural_exposure_score: 70.7, score_status: 'EXPERIMENTAL', score_formula: 'formula', priority: 'high', source_snapshot_ids: [] }],
          public_opinion: [], industry_context: [], cleaning_summary: { duplicates_removed: 0, expired_removed: 0, missing_occupation: 0, unmatched_categories: [], transform_version: 'test', before_after: [] },
          evidence_preview: [{ evidence_id: 'ev_1', title: 'ILO report', institution: 'ILO', authors: [], published_at: '2025', evidence_type: 'international report', authority_tier: 'A', method_summary: 'Task analysis', finding: '<jats:p>AI changes tasks</jats:p>', limitations: 'Not causal', url: 'https://ilo.org/report', retrieved_at: '2026-09-12T07:00:00Z', freshness: 'VERSIONED' }],
        }),
      })
    })
    vi.stubGlobal('fetch', fetch)

    render(<App />)
    fireEvent.click(await screen.findByRole('tab', { name: '論證' }))
    expect(screen.getByText('AI changes tasks')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('<jats:p>')
    fireEvent.click(screen.getByRole('button', { name: '執行權威證據 Agent' }))

    expect(await screen.findByText(/已通過原文認證：AI 主要改變工作任務。/)).toBeInTheDocument()
    expect(screen.getByText(/SHA-256 abcdef123456/)).toBeInTheDocument()
    expect(screen.getByText(/Harness test-v1/)).toBeInTheDocument()
    expect(screen.getByText(/台灣問題存在，但介入成效主要來自國際證據。/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/v1/evidence/verify', expect.objectContaining({ method: 'POST' }))
    const verifyCall = fetch.mock.calls.find(([url]) => String(url).endsWith('/v1/evidence/verify'))
    expect(JSON.parse(String(verifyCall?.[1]?.body))).toMatchObject({ occupation_code: '4' })
    fireEvent.click(screen.getByRole('tab', { name: '政策' }))
    expect(screen.getByRole('button', { name: '產生三個政策選項' })).toBeEnabled()
  })

  it('keeps all five indicator explanation drawers on the live dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => dashboardFixture,
    }))

    render(<App />)
    await screen.findByRole('button', { name: /^查看 S / })
    const dialog = document.querySelector('dialog')!
    Object.defineProperty(dialog, 'showModal', {
      value: () => dialog.setAttribute('open', ''),
    })
    Object.defineProperty(dialog, 'close', {
      value: () => dialog.removeAttribute('open'),
    })

    for (const id of ['S', 'A', 'B', 'H', 'D']) {
      const trigger = screen.getByRole('button', { name: new RegExp(`^查看 ${id} `) })
      fireEvent.click(trigger)
      expect(dialog).toHaveClass('indicator-drawer')
      expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent(`${id} ·`)
      fireEvent.click(within(dialog).getByRole('button', { name: '關閉詳情' }))
      expect(trigger).toHaveFocus()
    }
  })
})
