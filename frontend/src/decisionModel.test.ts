import { describe, expect, it } from 'vitest'
import {
  analysisFromDashboard,
  analysisKey,
  buildMeetingDraft,
  evidenceIssues,
  policyIssues,
  safeSourceUrl,
} from './decisionModel'
import {
  dashboardFixture,
  decisionFixture,
  evidenceFixture,
  policyFixture,
  verificationFixture,
} from './test/decisionFixtures'

describe('live dashboard 決策資料 adapter', () => {
  it('只使用目前 dashboard 的 run、來源與指標，不讀固定快照', () => {
    const analysis = analysisFromDashboard({
      dashboard: structuredClone(dashboardFixture),
      occupation: structuredClone(dashboardFixture.occupation_signals[0]),
      evidenceItems: [],
      verification: null,
      policy: null,
    })

    expect(analysis.id).toContain('run-live-1')
    expect(analysis.actualPopulation).toContain('20–24 歲就業結構')
    expect(analysis.indicators.find((item) => item.id === 'structural')?.value).toBe(40)
    expect(analysis.indicators.find((item) => item.id === 'C')).toBeUndefined()
    expect(analysis.indicators.find((item) => item.id === 'Risk')).toBeUndefined()
    expect(analysis.policies).toEqual([])
    expect(buildMeetingDraft(analysis, [])?.kind).toBe('monitoring-summary')
  })

  it('取得受授權個體資料後，決策契約與來源會切換為精確 18–35 歲', () => {
    const dashboard = structuredClone(dashboardFixture)
    dashboard.sources.push({
      ...dashboard.sources[0],
      source_id: 'dgbas_microdata_18_35',
      dataset_name: '主計總處人力資源調查個體資料（加權彙總）',
      reference_url: 'https://doi.org/10.6141/TW-SRDA-AA000047-1',
    })
    dashboard.summary_metrics = {
      ...dashboard.summary_metrics,
      analysis_population_label: '18–35 歲',
      analysis_population_exact: true,
      analysis_population_source_id: 'dgbas_microdata_18_35',
    }
    const occupation = structuredClone(dashboard.occupation_signals[0])
    occupation.youth_employed_18_35 = occupation.youth_employed
    occupation.source_snapshot_ids = [
      'dgbas_microdata_18_35',
      'ilo_genai_exposure',
      'taiwanjobs',
      'mol_vacancy_history',
    ]

    const analysis = analysisFromDashboard({
      dashboard,
      occupation,
      evidenceItems: [],
      verification: null,
      policy: null,
    })

    expect(analysis.targetPopulation).toBe('18–35 歲青年')
    expect(analysis.actualPopulation).toContain('18–35 歲精確年齡')
    expect(analysis.indicators.find((item) => item.id === 'A')?.sourceRefs)
      .toEqual(['dgbas_microdata_18_35'])
    expect(analysis.claims[0].relations[0].evidenceId).toBe('dgbas_microdata_18_35')
  })

  it('只有同一分析版本、非 fixture 且通過原文閘門的政策可被選取', () => {
    const analysis = decisionFixture(2)
    expect(analysis.policies).toHaveLength(2)
    expect(policyIssues(analysis, analysis.policies[0])).toEqual([])
    expect(buildMeetingDraft(analysis, [analysis.policies[0].id])?.kind).toBe('policy-draft')

    const fixturePolicy = policyFixture(1)
    fixturePolicy.is_fixture = true
    const blocked = analysisFromDashboard({
      dashboard: structuredClone(dashboardFixture),
      occupation: structuredClone(dashboardFixture.occupation_signals[0]),
      evidenceItems: [structuredClone(evidenceFixture)],
      verification: structuredClone(verificationFixture),
      policy: fixturePolicy,
    })
    expect(policyIssues(blocked, blocked.policies[0])).toContain('政策適用性尚未核對')
  })

  it('資料或政策版本更新會改變閱讀上下文，舊草稿仍是獨立快照', () => {
    const analysis = decisionFixture(1)
    const draft = buildMeetingDraft(analysis, [analysis.policies[0].id], new Date('2026-09-13T02:00:00Z'))!
    const newer = structuredClone(analysis)
    newer.id = 'run-live-2:verify-2:policy-2'
    newer.policies[0].title = '新版政策'

    expect(analysisKey(newer)).not.toBe(analysisKey(analysis))
    expect(draft.analysis.policies[0].title).toBe('測試政策 1')
    expect(draft.assembledAt).toBe('2026-09-13T02:00:00.000Z')
  })

  it('缺少定位、核對日期或安全網址時不把來源當成已核對', () => {
    const analysis = decisionFixture(1)
    const source = analysis.evidence.find((item) => item.id === 'ev-1')!
    source.locator = null
    expect(evidenceIssues(source)).toContain('缺少原文定位')
    expect(safeSourceUrl('javascript:alert(1)')).toBeNull()
    expect(safeSourceUrl('https://user:secret@example.org')).toBeNull()
    expect(safeSourceUrl('https://example.org/source')).toBe('https://example.org/source')
  })
})
