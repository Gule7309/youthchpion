import { describe, expect, it } from 'vitest'
import { firstEvidenceSelection } from './App'
import type { EvidenceItem } from './types'

function evidence(
  evidence_id: string,
  authority_tier: EvidenceItem['authority_tier'] = 'A',
  freshness: EvidenceItem['freshness'] = 'VERSIONED',
): EvidenceItem {
  return {
    evidence_id,
    title: evidence_id,
    institution: 'test',
    authors: [],
    published_at: '2026',
    evidence_type: 'report',
    authority_tier,
    url: 'https://example.com',
    retrieved_at: '2026-09-13T00:00:00Z',
    freshness,
    discovery_source: 'unknown',
  }
}

describe('firstEvidenceSelection', () => {
  it('selects local context, exposure, and intervention evidence before live fallback', () => {
    const selected = firstEvidenceSelection([
      evidence('authority_taiwanjobs_ai_recruitment_survey_2024'),
      evidence('authority_ly_industry_newcomer_outcomes_2024'),
      evidence('live_search_result', 'B', 'LIVE'),
      evidence('authority_ilo_refined_index_2025'),
      evidence('authority_ilo_worldbank_youth_almp_2026'),
    ])

    expect(selected).toEqual([
      'authority_ly_industry_newcomer_outcomes_2024',
      'authority_ilo_refined_index_2025',
      'authority_ilo_worldbank_youth_almp_2026',
    ])
  })
})
