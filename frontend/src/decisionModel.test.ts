import { describe, expect, it } from 'vitest'
import { analysisFromSnapshot, analysisKey, buildMeetingDraft, claimIssues, evidenceIssues, policyIssues, relationIssues, safeSourceUrl, type Analysis } from './decisionModel'
import { decisionFixture } from './test/decisionFixtures'

describe('決策資料與報告整理', () => {
  it('正式快照只整理已有觀測，不填 Risk 或政策', () => {
    for (const code of ['4', '2', '5']) {
      const a = analysisFromSnapshot(code)
      expect(a.policies).toEqual([])
      expect(a.indicators.find(i => i.id === 'Risk')?.value).toBeNull()
      expect(a.actualPopulation).toContain('全年齡')
      expect(claimIssues(a, a.claims[0])).toEqual([])
      expect(a.claims[0].relations[0].reason).toContain('不支持青年失業')
    }
    expect(() => analysisFromSnapshot('unknown')).toThrow()
  })
  it('不允許執行型、相對或帶憑證網址', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,test', '/source', 'https://user:secret@example.org']) expect(safeSourceUrl(url)).toBeNull()
    expect(safeSourceUrl('https://example.org/source')).toBe('https://example.org/source')
  })
  it('缺失來源、定位與核對狀態不算有效引用', () => {
    const a = decisionFixture(1)
    expect(evidenceIssues(undefined)).toContain('引用不存在')
    a.evidence[0].locator = null
    expect(policyIssues(a, a.policies[0])).toContain('缺少原文定位')
    a.evidence[0].verification = 'pending'
    expect(policyIssues(a, a.policies[0])).toContain('來源尚未核對')
  })
  it('同一研究的角色依判讀而不同', () => {
    const a = decisionFixture()
    const supports = a.claims[0].relations[0]
    const limits = { ...supports, role: 'limits' as const, reason: '不可由求才推論因果' }
    expect(relationIssues(a, supports)).toEqual([])
    expect(relationIssues(a, limits)).toEqual([])
    expect(supports.role).toBe('supports')
    expect(limits.role).toBe('limits')
  })
  it('來源存在卻未關聯、無理由或未核對適用性時拒絕政策', () => {
    const a = decisionFixture(1)
    a.evidence.push({ ...a.evidence[0], id: 'unrelated' })
    a.policies[0].evidenceRefs = ['unrelated']
    expect(policyIssues(a, a.policies[0])).toContain('來源未關聯至政策判讀：unrelated')
    a.claims[0].relations[0].reason = ''
    a.claims[0].relations[0].verification = 'pending'
    expect(claimIssues(a, a.claims[0])).toContain('缺少關聯理由')
    expect(claimIssues(a, a.claims[0])).toContain('適用性尚未核對')
  })
  it('0、1、4 選項皆保留真實數量，未知成本不當零', () => {
    for (const n of [0, 1, 4]) {
      const a = decisionFixture(n)
      const draft = buildMeetingDraft(a, a.policies.map(p => p.id))!
      expect(draft.analysis.policies).toHaveLength(n)
      if (n) { expect(draft.analysis.policies[0].burden).toBeNull(); expect(draft.kind).toBe('policy-draft') }
      else expect(draft.kind).toBe('monitoring-summary')
    }
  })
  it('未選不代選，缺分數可監測，全空不產生文件', () => {
    const a = decisionFixture()
    expect(buildMeetingDraft(a, [])?.kind).toBe('monitoring-summary')
    a.claims = []; a.indicators = []
    expect(buildMeetingDraft(a, [])).toBeNull()
  })
  it('僅纳入選取且有效政策，去重來源並揭露排除項目', () => {
    const a = decisionFixture(4)
    a.policies[1].verification = 'pending'
    const draft = buildMeetingDraft(a, ['test-option-0', 'test-option-1', 'missing'])!
    expect(draft.analysis.policies.map(p => p.id)).toEqual(['test-option-0'])
    expect(draft.excluded).toHaveLength(2)
    expect(draft.analysis.evidence).toHaveLength(1)
    expect(draft.analysis.evidence[0].locator).toContain('113、114')
  })
  it('上下文鍵包含職業與版本，預覽不隨原資料變動', () => {
    const a = decisionFixture(1)
    const draft = buildMeetingDraft(a, ['test-option-0'], new Date('2026-09-12T12:00:00Z'))!
    a.policies[0].title = '新版標題'; a.evidence[0].summary = '新版摘要'; a.id = 'v2'
    expect(draft.analysis.policies[0].title).toBe('測試方案 1')
    expect(draft.analysis.evidence[0].summary).not.toBe('新版摘要')
    expect(analysisKey(draft.analysis)).not.toBe(analysisKey(a))
    expect(draft.assembledAt).toBe('2026-09-12T12:00:00.000Z')
    expect(analysisKey(a)).not.toBe(analysisKey(analysisFromSnapshot('2')))
  })
  it('拒絕錯職業、缺必要欄位及不可用指標', () => {
    const a = decisionFixture(1)
    a.policies[0].occupationCode = '2'; a.policies[0].mechanism = ''
    a.policies[0].indicatorRefs = ['Risk']
    expect(policyIssues(a, a.policies[0])).toEqual(expect.arrayContaining(['政策不屬於目前職業', '缺少政策必要說明', '指標不可用：Risk']))
  })
  it('不可用分析不能印假文件，不可用值不出現在表格', () => {
    const a: Analysis = decisionFixture()
    a.status = 'error'; expect(buildMeetingDraft(a, [])).toBeNull()
    a.status = 'partial'; a.indicators[7].value = NaN
    expect(buildMeetingDraft(a, [])?.analysis.indicators.some(i => Number.isNaN(i.value))).toBe(false)
  })
})
