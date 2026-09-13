import type {
  Dashboard,
  EvidenceItem,
  EvidenceVerification,
  OccupationSignal,
  PolicyResponse,
  SourceSnapshot,
  VerifiedClaim,
} from './types'

export type Verification = 'verified' | 'pending'
export type RelationRole = 'supports' | 'challenges' | 'limits' | 'background'
export type Availability = 'loading' | 'ready' | 'partial' | 'unavailable' | 'stale' | 'error'

export type Evidence = {
  id: string
  title: string
  author: string | null
  date: string | null
  type: string
  summary: string
  quote?: string
  url: string
  locator: string | null
  scope: string
  limitations: string
  verification: Verification
  checkedAt: string | null
}

export type Indicator = {
  id: string
  label: string
  value: number | null
  unit: string
  period: string
  scale: string
  method: 'exact' | 'estimated' | 'proxy'
  confidence: string | null
  status: Availability
  sourceRefs: string[]
}

export type EvidenceRelation = {
  evidenceId: string
  role: RelationRole
  reason: string
  verification: Verification
}

export type Claim = {
  id: string
  title: string
  text: string
  kind: 'observation' | 'inference' | 'hypothesis'
  verification: Verification
  indicatorRefs: string[]
  relations: EvidenceRelation[]
}

export type PolicyOption = {
  id: string
  occupationCode: string
  title: string
  target: string
  problem: string
  measures: string
  mechanism: string
  conditions: string | null
  partners: string | null
  burden: string | null
  benefit: string
  limitations: string
  kpi: { definition: string; period: string | null; source: string | null; target: string | null }
  claimRefs: string[]
  indicatorRefs: string[]
  evidenceRefs: string[]
  verification: Verification
}

export type Analysis = {
  id: string
  modelVersion: string
  occupation: { code: string; name: string; classificationVersion: string | null }
  targetPopulation: string
  actualPopulation: string
  geography: string
  periods: string[]
  checkedAt: string
  publishedAt: string | null
  status: Availability
  reason: string
  indicators: Indicator[]
  claims: Claim[]
  evidence: Evidence[]
  policies: PolicyOption[]
  limitations: string[]
}

export const relationLabels: Record<RelationRole, string> = {
  supports: '支持',
  challenges: '反證',
  limits: '限制',
  background: '背景',
}
export const claimLabels: Record<Claim['kind'], string> = {
  observation: '觀測',
  inference: '推論',
  hypothesis: '假說',
}

const SOURCE_INSTITUTIONS: Record<string, string> = {
  dgbas_employment: '行政院主計總處',
  ilo_genai_exposure: 'International Labour Organization',
  taiwanjobs: '台灣就業通／勞動部',
  job104_research: '104 人力銀行',
  mol_vacancy_history: '勞動部',
  moda_public_opinion: '數位發展部',
}

const percent = (value?: number) => value == null ? '缺值' : `${(value * 100).toFixed(1)}%`
const score = (value?: number) => value == null ? '缺值' : value.toFixed(1)

export const analysisKey = (analysis: Analysis) => JSON.stringify([
  analysis.id,
  analysis.occupation.code,
  analysis.occupation.classificationVersion,
])

export function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

export function evidenceIssues(evidence?: Evidence): string[] {
  if (!evidence) return ['引用不存在']
  return [
    evidence.verification !== 'verified' && '來源尚未核對',
    !evidence.locator?.trim() && '缺少原文定位',
    !safeSourceUrl(evidence.url) && '缺少安全來源網址',
    !evidence.checkedAt && '缺少核對日期',
  ].filter((issue): issue is string => Boolean(issue))
}

export function relationIssues(analysis: Analysis, relation: EvidenceRelation): string[] {
  return [
    ...evidenceIssues(analysis.evidence.find((item) => item.id === relation.evidenceId)),
    ...(!relation.reason.trim() ? ['缺少關聯理由'] : []),
    ...(relation.verification !== 'verified' ? ['適用性尚未核對'] : []),
  ]
}

export function indicatorIssues(analysis: Analysis, id: string): string[] {
  const indicator = analysis.indicators.find((item) => item.id === id)
  if (!indicator || indicator.value === null || !Number.isFinite(indicator.value)
    || !['ready', 'stale'].includes(indicator.status)) return [`指標不可用：${id}`]
  if (!indicator.sourceRefs.length) return [`指標缺少來源：${id}`]
  return indicator.sourceRefs.flatMap((ref) => evidenceIssues(
    analysis.evidence.find((item) => item.id === ref),
  ))
}

export function claimIssues(analysis: Analysis, claim: Claim): string[] {
  return [
    ...(claim.verification !== 'verified' ? ['判讀尚未核對'] : []),
    ...(!claim.relations.length ? ['沒有研究或資料關聯'] : []),
    ...claim.indicatorRefs.flatMap((id) => indicatorIssues(analysis, id)),
    ...claim.relations.flatMap((relation) => relationIssues(analysis, relation)),
  ]
}

export function policyIssues(analysis: Analysis, policy: PolicyOption): string[] {
  const issues: string[] = []
  if (policy.occupationCode !== analysis.occupation.code) issues.push('政策不屬於目前職業')
  if (policy.verification !== 'verified') issues.push('政策適用性尚未核對')
  if (![policy.title, policy.target, policy.problem, policy.measures, policy.mechanism,
    policy.benefit, policy.limitations, policy.kpi.definition].every((value) => value.trim())) {
    issues.push('缺少政策必要說明')
  }
  if (!policy.claimRefs.length || !policy.indicatorRefs.length || !policy.evidenceRefs.length) {
    issues.push('缺少政策必要引用')
  }
  for (const id of policy.claimRefs) {
    const claim = analysis.claims.find((item) => item.id === id)
    if (!claim) issues.push(`判讀引用不存在：${id}`)
    else issues.push(...claimIssues(analysis, claim))
  }
  for (const id of policy.indicatorRefs) issues.push(...indicatorIssues(analysis, id))
  for (const id of policy.evidenceRefs) {
    issues.push(...evidenceIssues(analysis.evidence.find((item) => item.id === id)))
    if (!policy.claimRefs.some((claimId) => analysis.claims.find((claim) => claim.id === claimId)
      ?.relations.some((relation) => relation.evidenceId === id && !relationIssues(analysis, relation).length))) {
      issues.push(`來源未關聯至政策判讀：${id}`)
    }
  }
  return [...new Set(issues)]
}

export type MeetingDraft = {
  kind: 'policy-draft' | 'monitoring-summary'
  assembledAt: string
  analysis: Analysis
  excluded: string[]
}

export function buildMeetingDraft(
  analysis: Analysis,
  selected: readonly string[],
  now = new Date(),
): MeetingDraft | null {
  if (!['ready', 'partial', 'stale'].includes(analysis.status)) return null
  const claims = analysis.claims.filter((claim) => !claimIssues(analysis, claim).length)
  const indicators = analysis.indicators.filter((indicator) => indicator.value !== null
    && Number.isFinite(indicator.value)
    && ['ready', 'stale'].includes(indicator.status)
    && indicator.sourceRefs.length > 0
    && indicator.sourceRefs.every((id) => !evidenceIssues(
      analysis.evidence.find((item) => item.id === id),
    ).length))
  if (!claims.length && !indicators.length) return null
  const policies = analysis.policies.filter((policy) => selected.includes(policy.id)
    && !policyIssues(analysis, policy).length)
  const excluded = [...new Set(selected)]
    .filter((id) => !policies.some((policy) => policy.id === id))
    .map((id) => {
      const policy = analysis.policies.find((item) => item.id === id)
      return `${policy?.title ?? id}：${policy ? policyIssues(analysis, policy).join('、') : '選項已不存在'}`
    })
  const refs = new Set([
    ...claims.flatMap((claim) => claim.relations.map((relation) => relation.evidenceId)),
    ...indicators.flatMap((indicator) => indicator.sourceRefs),
    ...policies.flatMap((policy) => policy.evidenceRefs),
  ])
  return structuredClone({
    kind: policies.length ? 'policy-draft' : 'monitoring-summary',
    assembledAt: now.toISOString(),
    analysis: {
      ...analysis,
      claims,
      indicators,
      policies,
      evidence: analysis.evidence.filter((item) => refs.has(item.id)),
    },
    excluded,
  })
}

function sourceEvidence(source: SourceSnapshot): Evidence {
  const locator = source.fields_used?.filter(Boolean).join('；') || null
  const url = source.reference_url ?? source.discovery_url ?? source.source_url
  const verified = source.status !== 'FAILED'
    && Boolean(source.content_sha256)
    && Boolean(locator)
    && Boolean(source.retrieved_at)
    && Boolean(safeSourceUrl(url))
  return {
    id: source.source_id,
    title: source.dataset_name ?? source.source_id,
    author: SOURCE_INSTITUTIONS[source.source_id] ?? null,
    date: source.source_published_at ?? null,
    type: '資料來源快照',
    summary: source.why_used ?? `${source.raw_rows} 筆原始資料轉為 ${source.normalized_rows} 筆標準資料。`,
    url,
    locator,
    scope: [source.data_period, `${source.normalized_rows} 筆標準資料`].filter(Boolean).join('；'),
    limitations: source.limitations ?? '來源限制待補。',
    verification: verified ? 'verified' : 'pending',
    checkedAt: source.retrieved_at || null,
  }
}

function researchEvidence(
  item: EvidenceItem,
  verification: EvidenceVerification | null,
): Evidence {
  const claim = verification?.claims.find((candidate) => candidate.evidence_id === item.evidence_id)
  const approved = verification?.approved_evidence_ids.includes(item.evidence_id) && Boolean(claim)
  return {
    id: item.evidence_id,
    title: item.title,
    author: item.authors.length ? item.authors.join('、') : item.institution || null,
    date: item.published_at ?? null,
    type: `${item.authority_tier} 級 ${item.evidence_type}`,
    summary: item.finding ?? item.method_summary ?? '目前只有候選來源 metadata。',
    quote: claim?.excerpt,
    url: claim?.retrieved_url ?? claim?.source_url ?? item.url,
    locator: claim?.locator ?? null,
    scope: claim ? `已由權威證據 Agent 核對；${claim.support}` : '候選來源，尚未通過原文核對',
    limitations: claim?.limitations.join('；') || item.limitations || '適用限制待核對。',
    verification: approved ? 'verified' : 'pending',
    checkedAt: approved ? verification?.verified_at ?? item.retrieved_at : null,
  }
}

function evidenceFromClaim(claim: VerifiedClaim, verification: EvidenceVerification): Evidence {
  return {
    id: claim.evidence_id,
    title: claim.source_title,
    author: null,
    date: null,
    type: 'Agent 核對來源',
    summary: claim.claim,
    quote: claim.excerpt,
    url: claim.retrieved_url ?? claim.source_url,
    locator: claim.locator,
    scope: `已由權威證據 Agent 核對；${claim.support}`,
    limitations: claim.limitations.join('；') || '未提供額外限制。',
    verification: 'verified',
    checkedAt: verification.verified_at,
  }
}

function sourceAvailability(source: SourceSnapshot | undefined, value: number | null): Availability {
  if (value === null || !Number.isFinite(value) || !source || source.status === 'FAILED') return 'unavailable'
  return ['STALE', 'CACHED'].includes(source.status) ? 'stale' : 'ready'
}

function buildIndicator(
  sources: Map<string, SourceSnapshot>,
  id: string,
  label: string,
  value: number | undefined,
  unit: string,
  sourceIds: string[],
  method: Indicator['method'],
  confidence: string | null,
): Indicator {
  const numeric = value == null || !Number.isFinite(value) ? null : value
  const presentSources = sourceIds.filter((sourceId) => sources.has(sourceId))
  const statuses = presentSources.map((sourceId) => sourceAvailability(sources.get(sourceId), numeric))
  const status = numeric === null || !presentSources.length || statuses.includes('unavailable')
    ? 'unavailable'
    : statuses.includes('stale') ? 'stale' : 'ready'
  const period = [...new Set(presentSources.map((sourceId) => sources.get(sourceId)?.data_period)
    .filter((item): item is string => Boolean(item)))].join('、') || '未提供'
  return {
    id,
    label,
    value: numeric,
    unit,
    period,
    scale: unit === '%' ? '0–100' : unit === '分' ? '0–100' : '來源定義',
    method,
    confidence,
    status,
    sourceRefs: presentSources,
  }
}

function relation(sourceId: string, reason: string): EvidenceRelation {
  return { evidenceId: sourceId, role: 'supports', reason, verification: 'verified' }
}

export function analysisFromDashboard({
  dashboard,
  occupation,
  evidenceItems,
  verification,
  policy,
}: {
  dashboard: Dashboard
  occupation: OccupationSignal
  evidenceItems: EvidenceItem[]
  verification: EvidenceVerification | null
  policy: PolicyResponse | null
}): Analysis {
  const sourceMap = new Map(dashboard.sources.map((source) => [source.source_id, source]))
  const sourceEvidenceItems = dashboard.sources.map(sourceEvidence)
  const researchItems = [...evidenceItems]
  if (verification) {
    for (const claim of verification.claims) {
      if (!researchItems.some((item) => item.evidence_id === claim.evidence_id)) {
        researchItems.push({
          evidence_id: claim.evidence_id,
          title: claim.source_title,
          institution: '',
          authors: [],
          evidence_type: 'Agent 核對來源',
          authority_tier: 'A',
          finding: claim.claim,
          limitations: claim.limitations.join('；'),
          url: claim.source_url,
          retrieved_at: verification.verified_at,
          freshness: 'VERSIONED',
        })
      }
    }
  }
  const researchEvidenceItems = researchItems.map((item) => researchEvidence(item, verification))
  const evidence = [...sourceEvidenceItems, ...researchEvidenceItems]
  if (verification) {
    for (const claim of verification.claims) {
      if (!evidence.some((item) => item.id === claim.evidence_id)) evidence.push(evidenceFromClaim(claim, verification))
    }
  }

  const indicators = [
    buildIndicator(sourceMap, 'A', '職業內 20–24 歲占比', occupation.youth_employment_share == null ? undefined : occupation.youth_employment_share * 100, '%', ['dgbas_employment'], 'exact', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'B', 'ILO 生成式 AI 職務暴露', occupation.exposure_score, '0–1', ['ilo_genai_exposure'], 'proxy', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'C', '台灣產業 AI 導入', occupation.industry_adoption_score == null ? undefined : occupation.industry_adoption_score * 100, '%', ['job104_research'], 'proxy', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'H', '官方求才弱化', occupation.recruitment_weakening == null ? undefined : occupation.recruitment_weakening * 100, '%', ['mol_vacancy_history'], 'exact', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'D', 'AI 初階機會占比', occupation.ai_entry_opportunity_rate == null ? undefined : occupation.ai_entry_opportunity_rate * 100, '%', ['taiwanjobs'], 'estimated', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'vacancy-previous', '官方前期求才', occupation.recruitment_vacancies_previous, '人次', ['mol_vacancy_history'], 'exact', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'vacancy-current', '官方本期求才', occupation.recruitment_vacancies_current, '人次', ['mol_vacancy_history'], 'exact', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'jobs-total', '即時初階職缺樣本', occupation.total_entry_jobs, '個職缺', ['taiwanjobs'], 'estimated', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'jobs-ai', 'AI 相關初階職缺樣本', occupation.ai_entry_jobs, '個職缺', ['taiwanjobs'], 'estimated', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'structural', '實驗性結構暴露', occupation.structural_exposure_score, '分', ['dgbas_employment', 'ilo_genai_exposure'], 'proxy', occupation.data_confidence ?? null),
    buildIndicator(sourceMap, 'Risk', '完整風險', occupation.complete_risk_score, '分', ['dgbas_employment', 'ilo_genai_exposure', 'job104_research', 'mol_vacancy_history'], 'proxy', occupation.data_confidence ?? null),
  ]

  const claims: Claim[] = []
  if (occupation.structural_exposure_score != null) {
    claims.push({
      id: 'structural-exposure',
      title: '結構暴露可用於職業間排序',
      text: `${occupation.name}的實驗性結構暴露為 ${score(occupation.structural_exposure_score)}／100；這是 A×B 排序，不是失業或取代機率。`,
      kind: 'observation',
      verification: 'verified',
      indicatorRefs: ['A', 'B', 'structural'],
      relations: [
        relation('dgbas_employment', '主計總處提供職業內 20–24 歲就業結構。'),
        relation('ilo_genai_exposure', 'ILO 任務暴露資料提供跨職業可比較的 B proxy。'),
      ],
    })
  }
  if (occupation.recruitment_weakening != null) {
    claims.push({
      id: 'recruitment-change',
      title: '官方求才趨勢提供獨立弱化訊號',
      text: `${occupation.name}的官方求才年變化為 ${percent(occupation.recruitment_yoy_change)}，換算 H 為 ${percent(occupation.recruitment_weakening)}；不能直接歸因於 AI。`,
      kind: 'observation',
      verification: 'verified',
      indicatorRefs: ['H'],
      relations: [relation('mol_vacancy_history', '勞動部歷年求才序列提供同職業、同口徑的變化訊號。')],
    })
  }
  if (occupation.ai_entry_opportunity_rate != null) {
    claims.push({
      id: 'entry-opportunity',
      title: '即時職缺反映 AI 初階機會樣本',
      text: `${occupation.name}目前樣本中有 ${occupation.ai_entry_jobs.toLocaleString('zh-TW')} 個 AI 相關初階機會，占比 ${percent(occupation.ai_entry_opportunity_rate)}；此值受平台與分類覆蓋限制。`,
      kind: 'observation',
      verification: 'verified',
      indicatorRefs: ['D'],
      relations: [relation('taiwanjobs', '台灣就業通即時職缺樣本提供 D 的分子、分母與品質狀態。')],
    })
  }
  for (const verifiedClaim of verification?.claims ?? []) {
    claims.push({
      id: verifiedClaim.claim_id,
      title: verifiedClaim.source_title,
      text: verifiedClaim.claim,
      kind: 'inference',
      verification: 'verified',
      indicatorRefs: [],
      relations: [{
        evidenceId: verifiedClaim.evidence_id,
        role: 'supports',
        reason: `${verifiedClaim.support}；${verifiedClaim.authority_basis ?? '已通過來源與原文出版閘門。'}`,
        verification: 'verified',
      }],
    })
  }

  const approvedEvidenceIds = new Set(verification?.approved_evidence_ids ?? [])
  const policyIndicatorRefs = indicators
    .filter((indicator) => ['structural', 'H', 'D'].includes(indicator.id))
    .filter((indicator) => !indicatorIssues({ indicators, evidence } as Analysis, indicator.id).length)
    .map((indicator) => indicator.id)
  const policyOptions = (policy?.analysis_run_id === dashboard.analysis_run_id ? policy.options : []).map((option, index) => {
    const claimRefs = claims
      .filter((claim) => claim.relations.some((item) => option.evidence_ids.includes(item.evidenceId)))
      .map((claim) => claim.id)
    const evidenceVerified = option.evidence_ids.length > 0
      && option.evidence_ids.every((id) => approvedEvidenceIds.has(id))
    return {
      id: `policy-${index + 1}`,
      occupationCode: occupation.code,
      title: option.title,
      target: option.target_group,
      problem: option.problem,
      measures: option.implementation.join('；'),
      mechanism: option.mechanism,
      conditions: null,
      partners: null,
      burden: null,
      benefit: '預期效益需由實施後 KPI 評估，不作效果保證。',
      limitations: [...option.risks, ...option.limitations].join('；'),
      kpi: {
        definition: option.kpis.map((item) => item.name).join('；'),
        period: null,
        source: null,
        target: option.kpis.map((item) => `${item.name}：${item.target}`).join('；') || null,
      },
      claimRefs,
      indicatorRefs: policyIndicatorRefs,
      evidenceRefs: option.evidence_ids,
      verification: policy?.is_fixture === false && evidenceVerified && claimRefs.length > 0 && policyIndicatorRefs.length > 0
        ? 'verified' as const
        : 'pending' as const,
    }
  })

  const periods = [...new Set(dashboard.sources.map((source) => source.data_period)
    .filter((item): item is string => Boolean(item)))]
  const scoreVersion = String(dashboard.summary_metrics.score_version ?? occupation.score_formula)
  const analysisStatus: Availability = dashboard.overall_status === 'FAILED'
    ? 'error'
    : ['STALE', 'CACHED'].includes(dashboard.overall_status)
      ? 'stale'
      : occupation.complete_risk_score == null ? 'partial' : 'ready'
  return {
    id: [dashboard.analysis_run_id, verification?.verification_id ?? 'no-verification', policy?.generated_at ?? 'no-policy'].join(':'),
    modelVersion: scoreVersion,
    occupation: { code: occupation.code, name: occupation.name, classificationVersion: null },
    targetPopulation: '20–24 歲青年',
    actualPopulation: '20–24 歲就業結構；求才與即時職缺為全年齡／平台樣本',
    geography: '臺灣全國職業大類',
    periods,
    checkedAt: dashboard.published_at,
    publishedAt: dashboard.published_at,
    status: analysisStatus,
    reason: String(dashboard.summary_metrics.metric_warning ?? '各指標依可用來源獨立揭露，缺值不補造。'),
    indicators,
    claims,
    evidence,
    policies: policyOptions,
    limitations: [
      'A×B 是實驗性結構暴露排序，不是失業機率或 AI 因果估計。',
      'C 缺少可靠的產業到職業權重時，完整 Risk 保持空值。',
      'H 與 D 是獨立訊號，不互相抵銷；公眾感受也不冒充客觀風險。',
      ...(occupation.data_confidence_reasons ?? []),
      ...(verification?.gaps ?? []),
      ...(policy?.warnings ?? []),
    ],
  }
}
