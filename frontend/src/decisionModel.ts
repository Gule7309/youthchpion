import { annualChange, pendingIndicators, snapshot } from './verifiedSnapshot'

export type Verification = 'verified' | 'pending'
export type RelationRole = 'supports' | 'challenges' | 'limits' | 'background'
export type Availability = 'loading' | 'ready' | 'partial' | 'unavailable' | 'stale' | 'error'
export type Evidence = {
  id: string; title: string; author: string | null; date: string | null; type: string
  summary: string; quote?: string; url: string; locator: string | null
  scope: string; limitations: string; verification: Verification; checkedAt: string | null
}
export type Indicator = {
  id: string; label: string; value: number | null; unit: string; period: string
  scale: string; method: 'exact' | 'estimated' | 'proxy'; confidence: string | null
  status: Availability; sourceRefs: string[]
}
export type EvidenceRelation = { evidenceId: string; role: RelationRole; reason: string; verification: Verification }
export type Claim = {
  id: string; title: string; text: string; kind: 'observation' | 'inference' | 'hypothesis'
  verification: Verification; indicatorRefs: string[]; relations: EvidenceRelation[]
}
export type PolicyOption = {
  id: string; occupationCode: string; title: string; target: string; problem: string
  measures: string; mechanism: string; conditions: string | null; partners: string | null
  burden: string | null; benefit: string; limitations: string
  kpi: { definition: string; period: string | null; source: string | null; target: string | null }
  claimRefs: string[]; indicatorRefs: string[]; evidenceRefs: string[]; verification: Verification
}
export type Analysis = {
  id: string; modelVersion: string; occupation: { code: string; name: string; classificationVersion: string | null }
  targetPopulation: string; actualPopulation: string; geography: string; periods: string[]
  checkedAt: string; publishedAt: string | null; status: Availability; reason: string
  indicators: Indicator[]; claims: Claim[]; evidence: Evidence[]; policies: PolicyOption[]; limitations: string[]
}
export const relationLabels: Record<RelationRole, string> = { supports: '支持', challenges: '反證', limits: '限制', background: '背景' }
export const claimLabels: Record<Claim['kind'], string> = { observation: '觀測', inference: '推論', hypothesis: '假說' }
export const analysisKey = (a: Analysis) => JSON.stringify([a.id, a.occupation.code, a.occupation.classificationVersion])
export function safeSourceUrl(value: string): string | null {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null }
  catch { return null }
}
export function evidenceIssues(e?: Evidence): string[] {
  if (!e) return ['引用不存在']
  return [e.verification !== 'verified' && '來源尚未核對', !e.locator?.trim() && '缺少原文定位',
    !safeSourceUrl(e.url) && '缺少安全來源網址', !e.checkedAt && '缺少核對日期'].filter((x): x is string => !!x)
}
export function relationIssues(a: Analysis, relation: EvidenceRelation): string[] {
  return [...evidenceIssues(a.evidence.find(e => e.id === relation.evidenceId)),
    ...(!relation.reason.trim() ? ['缺少關聯理由'] : []), ...(relation.verification !== 'verified' ? ['適用性尚未核對'] : [])]
}
export function indicatorIssues(a: Analysis, id: string): string[] {
  const i = a.indicators.find(i => i.id === id)
  if (!i || i.value === null || !Number.isFinite(i.value) || !['ready', 'stale'].includes(i.status)) return [`指標不可用：${id}`]
  if (!i.sourceRefs.length) return [`指標缺少來源：${id}`]
  return i.sourceRefs.flatMap(ref => evidenceIssues(a.evidence.find(e => e.id === ref)))
}
export function claimIssues(a: Analysis, claim: Claim): string[] {
  return [...(claim.verification !== 'verified' ? ['判讀尚未核對'] : []),
    ...(!claim.relations.length ? ['沒有研究或資料關聯'] : []),
    ...claim.indicatorRefs.flatMap(id => indicatorIssues(a, id)),
    ...claim.relations.flatMap(r => relationIssues(a, r))]
}
export function policyIssues(a: Analysis, p: PolicyOption): string[] {
  const issues: string[] = []
  if (p.occupationCode !== a.occupation.code) issues.push('政策不屬於目前職業')
  if (p.verification !== 'verified') issues.push('政策適用性尚未核對')
  if (![p.title, p.target, p.problem, p.measures, p.mechanism, p.benefit, p.limitations, p.kpi.definition].every(s => s.trim())) issues.push('缺少政策必要說明')
  if (!p.claimRefs.length || !p.indicatorRefs.length || !p.evidenceRefs.length) issues.push('缺少政策必要引用')
  for (const id of p.claimRefs) {
    const claim = a.claims.find(c => c.id === id)
    if (!claim) issues.push(`判讀引用不存在：${id}`)
    else issues.push(...claimIssues(a, claim))
  }
  for (const id of p.indicatorRefs) {
    issues.push(...indicatorIssues(a, id))
  }
  for (const id of p.evidenceRefs) {
    issues.push(...evidenceIssues(a.evidence.find(e => e.id === id)))
    if (!p.claimRefs.some(cid => a.claims.find(c => c.id === cid)?.relations.some(r => r.evidenceId === id && !relationIssues(a, r).length))) issues.push(`來源未關聯至政策判讀：${id}`)
  }
  return [...new Set(issues)]
}

export type MeetingDraft = {
  kind: 'policy-draft' | 'monitoring-summary'; assembledAt: string; analysis: Analysis
  excluded: string[]
}
export function buildMeetingDraft(a: Analysis, selected: readonly string[], now = new Date()): MeetingDraft | null {
  if (!['ready', 'partial', 'stale'].includes(a.status)) return null
  const claims = a.claims.filter(c => !claimIssues(a, c).length)
  const indicators = a.indicators.filter(i => i.value !== null && Number.isFinite(i.value) && ['ready', 'stale'].includes(i.status)
    && i.sourceRefs.length > 0 && i.sourceRefs.every(id => !evidenceIssues(a.evidence.find(e => e.id === id)).length))
  if (!claims.length && !indicators.length) return null
  const policies = a.policies.filter(p => selected.includes(p.id) && !policyIssues(a, p).length)
  const excluded = [...new Set(selected)].filter(id => !policies.some(p => p.id === id)).map(id => {
    const p = a.policies.find(p => p.id === id)
    return `${p?.title ?? id}：${p ? policyIssues(a, p).join('、') : '選項已不存在'}`
  })
  const refs = new Set([...claims.flatMap(c => c.relations.map(r => r.evidenceId)), ...indicators.flatMap(i => i.sourceRefs), ...policies.flatMap(p => p.evidenceRefs)])
  // Own every nested object: a later refresh must never mutate a preview.
  return structuredClone({ kind: policies.length ? 'policy-draft' : 'monitoring-summary', assembledAt: now.toISOString(),
    analysis: { ...a, claims, indicators, policies, evidence: a.evidence.filter(e => refs.has(e.id)) }, excluded })
}

/** Adapter for the existing reviewed snapshot, NOT a fallback for an API payload. */
export function analysisFromSnapshot(code: string): Analysis {
  const o = snapshot.occupations.find(o => o.code === code)
  if (!o) throw new Error('未知職業')
  const delta = annualChange(o.previous, o.current)
  const label = delta === null ? '無可比年變化' : `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(2)}%`
  const sourceId = `mol-demand-${o.code}`
  return {
    id: snapshot.id, modelVersion: 'v0.4 候選', occupation: { code: o.code, name: o.name, classificationVersion: null },
    targetPopulation: '18–35 歲', actualPopulation: '全年齡新登記求才人次，非青年新人職缺', geography: '全國', periods: ['2024', '2025'],
    checkedAt: snapshot.checkedAt, publishedAt: null, status: 'partial', reason: 'Risk 與職業政策證據尚未核定',
    indicators: [
      ...(['Risk', 'S', 'A', 'B', 'C', 'H', 'D'] as const).map(id => ({ id, label: id, value: null, unit: '', period: '待核定', scale: '待核定', method: 'proxy' as const, confidence: null, status: 'unavailable' as const, sourceRefs: [] })),
      ...[{ id: 'demand-2024', value: o.previous, period: '2024' }, { id: 'demand-2025', value: o.current, period: '2025' }].map(i => ({ ...i, label: '新登記求才', unit: '人次', scale: '從零起算', method: 'exact' as const, confidence: null, status: 'ready' as const, sourceRefs: [sourceId] })),
    ],
    claims: [{ id: 'recruitment-change', title: '整體招募出現變化', kind: 'observation', verification: 'verified',
      text: `${o.name}的新登記求才人次由 ${o.previous.toLocaleString('zh-TW')} 變為 ${o.current.toLocaleString('zh-TW')}，2024 至 2025 年變化為 ${label}。`,
      indicatorRefs: ['demand-2024', 'demand-2025'], relations: [{ evidenceId: sourceId, role: 'supports', verification: 'verified', reason: '已核對快照的兩年同職業、同單位原始值；僅支持整體求才年變化，不支持青年失業或 AI 因果判斷。' }] }],
    evidence: [{ id: sourceId, title: '就業服務之求才及求才僱用人數按職業分', author: '勞動部', date: null, type: '官方統計／API JSON',
      summary: `現有已核對快照：${o.name}，113 年 ${o.previous.toLocaleString('zh-TW')} 人次、114 年 ${o.current.toLocaleString('zh-TW')} 人次。`,
      url: snapshot.rawUrl, locator: `統計期：113、114 年；職業：${o.name}；欄位：新登記求才人數（人次）`,
      scope: '全國、全年齡求才；不是 18–35 歲就業人口', limitations: '不能區分青年／新人需求，也不能由年變化推論 AI 取代；精確抓取時間及 SHA-256 未保存在此快照。', verification: 'verified', checkedAt: snapshot.checkedAt },
      ...[pendingIndicators[1], pendingIndicators[2]].map(m => ({ id: `background-${m.id}`, title: m.name, author: m.id === 'B' ? 'ILO' : 'AIF', date: null, type: '方法／背景來源', summary: m.reason, url: m.source, locator: null, scope: '職業適用性待核對', limitations: '不作為此職業的政策或因果背書。', verification: 'pending' as const, checkedAt: null })),
    ], policies: [], limitations: ['A／B／C 尚待核對，無完整 S 與 Risk；D 需求占比及排名尚未建立。', '求才上升不代表低風險；下降不代表被 AI 取代。', '職業專屬的政策選項、KPI 與研究適用性仍待核對。'],
  }
}
