import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not replace a missing dashboard with fixture metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ detail: 'dashboard_not_ready' }),
    }))

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: /先建立第一份.*真實分析快照/ }),
    ).toBeInTheDocument()
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
          processing_steps: ['擷取 20–24 與 25–29 歲'],
          retrieved_at: '2026-09-12T07:00:00Z',
          http_status: 200,
          content_sha256: 'abcdef1234567890',
          raw_rows: 7,
          normalized_rows: 7,
        }],
        summary_metrics: { youth_employed_20_29: 10, youth_ai_exposure_load: 0.1 },
        occupation_signals: [{
          code: '4',
          name: '事務支援人員',
          youth_employed: 10,
          youth_employment_share: 1,
          exposure_level: 'gradient',
          exposure_score: 0.5,
          ai_entry_jobs: 0,
          total_entry_jobs: 1,
          ai_entry_opportunity_rate: 0,
          priority: 'high',
          source_snapshot_ids: ['dgbas_employment'],
        }],
        public_opinion: [{ value: 39.5 }],
        industry_context: [],
        cleaning_summary: {
          raw_rows: 7,
          normalized_rows: 7,
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

    expect(await screen.findByText('主計總處／就業結構')).toBeInTheDocument()
    expect(screen.getByText(/本次仍有重新連線並下載/)).toBeInTheDocument()
    expect(screen.getByText('擷取 20–24 與 25–29 歲')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '官方說明' })).toHaveAttribute(
      'href',
      'https://example.com/about',
    )
    expect(screen.getByRole('link', { name: '機器原始資料' })).toHaveAttribute(
      'href',
      'https://example.com/raw.xlsx',
    )
  })
})
