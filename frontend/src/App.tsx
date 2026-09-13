import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BackendNotice } from './BackendNotice'
import { ChangeText } from './AnnualChange'
import {
  generatePolicy,
  getDashboard,
  refreshDashboard,
  searchEvidence,
  verifyEvidence,
} from './api'
import type {
  Dashboard,
  EvidenceItem,
  EvidenceVerification,
  OccupationSignal,
  PolicyResponse,
} from './types'
import {
  AnalysisSummary,
  ClaimList,
  EvidenceDetail,
  LinkedEvidence,
  PolicyMeeting,
  type DecisionFlow,
} from './DecisionPanels'
import { analysisFromDashboard, analysisKey } from './decisionModel'
import { FolderWorkspace, type WorkspaceHandle } from './FolderWorkspace'
import { Icon, type IconName } from './Icon'
import { useDecisionMeeting } from './useDecisionMeeting'
import { indicatorHelp, IndicatorExplanation, type IndicatorId } from './indicatorHelp'
import './folderDashboard.css'
import './indicatorHelp.css'
import './uiRefinements.css'

const number = new Intl.NumberFormat('zh-TW')
const percent = (value?: number) => value == null ? '—' : `${(value * 100).toFixed(1)}%`
const score = (value?: number) => value == null ? '—' : value.toFixed(1)
const confidence = (value?: OccupationSignal['data_confidence']) => value === 'MEDIUM' ? '中' : '低'
const dStatus = (value?: OccupationSignal['ai_entry_opportunity_status']) => ({
  READY_EXPERIMENTAL: '通過實驗性品質閘門',
  LOW_SAMPLE: '樣本不足',
  LOW_AI_MAPPING_COVERAGE: 'AI 子樣本映射不足',
  NO_DENOMINATOR: '沒有可用分母',
}[value ?? 'NO_DENOMINATOR'])
const time = (value?: string) => value
  ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '—'
const evidenceText = (value?: string) => value
  ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  : '目前只有索引 metadata；Agent 不會把它直接當成主張證據。'
const evidenceRole = (value?: EvidenceItem['evidence_role']) => ({
  PROBLEM_CONTEXT: '問題脈絡',
  EXPOSURE_METHOD: '暴露方法',
  INTERVENTION_EFFECT: '介入效果研究',
  OUTCOME_MONITORING: '台灣成果監測',
  PUBLIC_OPINION: '公眾感受',
  BACKGROUND: '背景資料',
}[value ?? 'BACKGROUND'])
const applicabilityStatus = (value: EvidenceVerification['taiwan_applicability']['status']) => ({
  TAIWAN_CONTEXT_WITH_LOCAL_INTERVENTION: '台灣脈絡＋本地介入效果',
  TAIWAN_CONTEXT_WITH_LOCAL_OUTCOME_MONITORING: '台灣脈絡＋本地成果監測',
  TAIWAN_CONTEXT_WITH_TRANSFER_EVIDENCE: '台灣脈絡＋國際轉移證據',
  INSUFFICIENT_TAIWAN_CONTEXT: '台灣脈絡不足',
}[value])

const SOURCE_NAMES: Record<string, string> = {
  dgbas_employment: '主計總處／20–24 歲就業結構',
  ilo_genai_exposure: 'ILO／生成式 AI 職業暴露',
  taiwanjobs: '台灣就業通／即時初階職缺',
  job104_research: '104／民間 AI 產業訊號',
  mol_vacancy_history: '勞動部／歷年職業求才人次',
  moda_public_opinion: '數發部／青年工作自動化感受',
}

const RESEARCH_QUERIES: Record<string, string> = {
  '3': 'generative AI technicians associate professionals employment skills training policy',
  '4': 'generative AI clerical occupations exposure employment skills training policy',
  '5': 'generative AI service sales occupations employment skills training policy',
}

type Detail = '資料來源' | '計算方式' | '清洗紀錄' | '估算限制' | `指標 ${IndicatorId}`
const DETAIL_ICONS: Record<Detail, IconName> = {
  資料來源: 'database',
  計算方式: 'formula',
  清洗紀錄: 'filter',
  估算限制: 'info',
  '指標 S': 'formula',
  '指標 A': 'users',
  '指標 B': 'sparkles',
  '指標 C': 'briefcase',
  '指標 H': 'chart',
  '指標 D': 'database',
}
const OCCUPATION_ICONS: Record<string, IconName> = {
  '2': 'book',
  '3': 'sparkles',
  '4': 'briefcase',
  '5': 'users',
}

function indicator(signal: OccupationSignal, id: string) {
  if (id === 'S') return { value: score(signal.structural_exposure_score), note: signal.structural_exposure_score == null ? 'A 或 B 缺值，暫不計算' : '以 A×B 計算，供職業間比較' }
  if (id === 'A') return { value: percent(signal.youth_employment_share), ratio: signal.youth_employment_share, note: `該職業內 20–24 歲占比；青年分布 P=${percent(signal.occupation_share_of_youth)}` }
  if (id === 'B') return { value: score(signal.exposure_score), ratio: signal.exposure_score, note: 'ILO 職務暴露代理值' }
  if (id === 'H') return { value: percent(signal.recruitment_weakening), ratio: signal.recruitment_weakening, note: `官方求才年變化 ${percent(signal.recruitment_yoy_change)}` }
  if (id === 'D') return { value: percent(signal.ai_entry_opportunity_rate), ratio: signal.ai_entry_opportunity_rate, note: `${number.format(signal.ai_entry_jobs)} 個 AI 相關機會；${dStatus(signal.ai_entry_opportunity_status)}` }
  return { value: '缺資料', ratio: undefined, note: '尚無可靠的職業層級導入訊號' }
}

export function firstEvidenceSelection(items: EvidenceItem[]) {
  const preferredKeys = ['industry_newcomer_outcomes', 'refined_index', 'youth_almp']
  const preferred = preferredKeys
    .map((key) => items.find((item) => item.evidence_id.includes(key)))
    .filter((item): item is EvidenceItem => Boolean(item))
  const officialFallback = items.filter(
    (item) => item.authority_tier === 'A' && !preferred.includes(item),
  )
  const liveFallback = items.filter(
    (item) => item.freshness === 'LIVE' && !preferred.includes(item),
  )
  return [...preferred, ...officialFallback, ...liveFallback]
    .slice(0, 3)
    .map((item) => item.evidence_id)
}

function researchQuery(signal: OccupationSignal) {
  return RESEARCH_QUERIES[signal.code]
    ?? `generative AI occupational exposure youth employment skills training policy ${signal.code}`
}

export default function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [selectedCode, setSelectedCode] = useState('')
  const [detail, setDetail] = useState<Detail>('資料來源')
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([])
  const [verification, setVerification] = useState<EvidenceVerification | null>(null)
  const [policy, setPolicy] = useState<PolicyResponse | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const dismissNotice = useCallback(() => setNotice(''), [])
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const [detailInstant, setDetailInstant] = useState(false)
  const indicatorId = !evidenceId && detail.startsWith('指標 ')
    ? detail.slice(3) as IndicatorId
    : null
  const workspace = useRef<WorkspaceHandle>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const restoreTrigger = useRef(false)

  function applyDashboard(value: Dashboard) {
    setDashboard(value)
    const ranked = [...value.occupation_signals].sort(
      (a, b) => (b.structural_exposure_score ?? -1) - (a.structural_exposure_score ?? -1),
    )
    setSelectedCode((current) => value.occupation_signals.some((item) => item.code === current)
      ? current
      : ranked[0]?.code ?? '')
    setEvidence(value.evidence_preview)
    setSelectedEvidence(firstEvidenceSelection(value.evidence_preview))
    setVerification(null)
    setPolicy(null)
  }

  useEffect(() => {
    getDashboard().then(applyDashboard).catch(() => undefined)
  }, [])

  const rankedSignals = useMemo(() => [...(dashboard?.occupation_signals ?? [])].sort(
    (a, b) => (b.structural_exposure_score ?? -1) - (a.structural_exposure_score ?? -1),
  ), [dashboard])
  const visibleSignals = rankedSignals.slice(0, 3)
  const selected = dashboard?.occupation_signals.find((item) => item.code === selectedCode)
    ?? visibleSignals[0]
  const maxVacancies = Math.max(...visibleSignals.flatMap((item) => [
    item.recruitment_vacancies_previous ?? 0,
    item.recruitment_vacancies_current ?? 0,
  ]), 1)
  const analysis = useMemo(() => dashboard && selected ? analysisFromDashboard({
    dashboard,
    occupation: selected,
    evidenceItems: evidence,
    verification,
    policy,
  }) : null, [dashboard, selected, evidence, verification, policy])
  const meeting = useDecisionMeeting(analysis)
  const contextKey = analysis ? analysisKey(analysis) : ''
  const flow: DecisionFlow | null = analysis ? {
    analysis,
    ...meeting,
    navigate: (index, target, instant) => workspace.current?.navigate(
      index,
      target,
      contextKey,
      instant,
    ),
    openEvidence: (id, button) => {
      trigger.current = button
      setEvidenceId(id)
      setModalOpen(true)
      dialog.current?.showModal()
    },
  } : null

  function openDetail(kind: Detail, button: HTMLButtonElement, instant = false) {
    setDetailInstant(instant)
    if (dialog.current) dialog.current.scrollTop = 0
    trigger.current = button
    setEvidenceId(null)
    setDetail(kind)
    setModalOpen(true)
    dialog.current?.showModal()
  }

  function closeDetail(restoreFocus = true) {
    restoreTrigger.current = restoreFocus
    if (dialog.current?.open) dialog.current.close()
    setModalOpen(false)
  }

  useLayoutEffect(() => {
    if (!modalOpen && restoreTrigger.current) {
      restoreTrigger.current = false
      if (trigger.current?.isConnected && !trigger.current.closest('[aria-hidden="true"]')) {
        trigger.current.focus({ preventScroll: true })
      } else {
        workspace.current?.focusCurrent()
      }
    }
  }, [modalOpen])

  function selectOccupation(code: string) {
    workspace.current?.saveReading()
    meeting.setDraft(null)
    setSelectedCode(code)
    setVerification(null)
    setPolicy(null)
  }

  async function refresh() {
    if (busy) return
    setBusy('QUEUED')
    setError('')
    setNotice('正在重新連線六個來源並建立新的可稽核快照。')
    try {
      const value = await refreshDashboard(setBusy)
      applyDashboard(value)
      setNotice(`更新完成：${value.analysis_run_id}。LIVE 代表內容改變；UNCHANGED 代表本次重抓後雜湊相同。`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '資料更新失敗')
      setNotice('')
    } finally {
      setBusy('')
    }
  }

  async function runSearch() {
    if (!selected) return
    setBusy('SEARCHING')
    setError('')
    try {
      const items = await searchEvidence(
        researchQuery(selected),
      )
      setEvidence(items)
      setSelectedEvidence(firstEvidenceSelection(items))
      setVerification(null)
      setPolicy(null)
      setNotice(`即時檢索完成，共取得 ${items.length} 個候選；下一步由權威證據 Agent 取回原文並核對段落。`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '權威來源檢索失敗')
    } finally {
      setBusy('')
    }
  }

  async function runVerification() {
    if (!dashboard || !selected || !selectedEvidence.length) return
    setBusy('VERIFYING')
    setError('')
    try {
      const value = await verifyEvidence({
        analysis_run_id: dashboard.analysis_run_id,
        occupation_code: selected.code,
        evidence_ids: selectedEvidence.slice(0, 3),
        search_query: researchQuery(selected),
        question: `請核對${selected.name}在生成式 AI 轉型下的技能需求、職務暴露，以及可供台灣青年就業政策採用的介入研究。`,
      })
      setEvidence(value.searched_candidates)
      setSelectedEvidence(value.approved_evidence_ids)
      setVerification(value)
      setPolicy(null)
      setNotice(`Agent ${value.status}：${value.claims.length} 筆主張通過來源與出版閘門。`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '權威證據 Agent 執行失敗')
    } finally {
      setBusy('')
    }
  }

  async function runPolicy() {
    if (!dashboard || !selected || !verification?.approved_evidence_ids.length) return
    setBusy('POLICY')
    setError('')
    try {
      setPolicy(await generatePolicy({
        analysis_run_id: dashboard.analysis_run_id,
        occupation_code: selected.code,
        policy_goal: '降低青年在生成式 AI 轉型中的技能與優質就業落差',
        evidence_ids: verification.approved_evidence_ids,
        verification_id: verification.verification_id,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '政策建議產生失敗')
    } finally {
      setBusy('')
    }
  }

  if (!dashboard) {
    return <main className="policy-dashboard"><section className="first-run">
      <span className="eyebrow">NO FIXTURE / NO PRETEND DATA</span>
      <h1>青年 AI 就業轉型雷達</h1>
      <p>目前沒有已發布快照。按下按鈕後才會查詢真實來源，不以固定數字補畫面。</p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <button className="button button--large" onClick={refresh} disabled={Boolean(busy)}>{busy || '建立真實快照'}</button>
    </section></main>
  }

  const metrics = dashboard.summary_metrics
  const dgbasPeriod = dashboard.sources.find(
    (source) => source.source_id === 'dgbas_employment',
  )?.data_period ?? '—'
  const renderPage = (index: number) => {
    if (index === 0) return <aside className="panel policy-indicators" aria-label="目前職業核心指標">
      <div className="indicator-heading"><h2>{selected?.name}</h2><div className="section-kicker"><Icon name="chart" /><span>核心指標</span></div></div>
      <div className="indicator-overview">
        {flow && <AnalysisSummary flow={flow} />}
        <div className="indicator-metrics">{([['S', '實驗性結構暴露'], ['A', '青年集中程度'], ['B', 'AI 能力暴露'], ['C', '台灣 AI 導入訊號'], ['H', '招募弱化'], ['D', 'AI 人才需求']] as const).map(([id, label]) => {
          const metric = selected ? indicator(selected, id) : { value: '—', ratio: undefined, note: '' }
          return <button type="button" className="policy-metric indicator-help-trigger" key={id} aria-label={`查看 ${id} ${label}的意涵與計算方式`} aria-haspopup="dialog" aria-controls="analysis-detail" onClick={(event) => openDetail(`指標 ${id}`, event.currentTarget, event.detail === 0)}>
            <span className={`metric-code metric-code--${id}`}>{id}</span>
            <span><b className="metric-name">{label}</b><small>{metric.note}</small><span className="indicator-help-link">意涵與計算方式 ↗</span></span>
            <strong aria-label={`${label}：${metric.value}`}>{metric.value}</strong>
          </button>
        })}</div>
      </div>
      <button className="policy-text-button" onClick={(event) => openDetail('計算方式', event.currentTarget)}><Icon name="formula" />查看計算方式<Icon name="arrow" /></button>
    </aside>

    if (index === 1) return <div className="risk-layout">
      <aside className="risk-overview">
        <span className="section-kicker">目前職業的結構暴露</span><h2>{selected?.name}</h2>
        <div className="policy-risk"><div className="risk-label"><span>實驗性結構暴露</span><Icon name="sparkles" /></div><strong>{score(selected?.structural_exposure_score)}<small> / 100</small></strong><span className="risk-caption">由青年集中程度與 AI 能力暴露計算</span></div>
        <p className="policy-muted">這是職業間的比較指標，不是失業或被 AI 取代的機率。</p>
        {flow?.analysis.claims[0] && <button className="policy-text-button" onClick={(event) => flow.navigate(2, `claim-${flow.analysis.claims[0].id}`, event.detail === 0)}>查看判讀原因<Icon name="arrow" /></button>}
      </aside>
      <section className="panel policy-comparison" aria-labelledby="comparison-title">
        <div className="panel__header"><div><div className="section-kicker"><Icon name="users" />職業比較</div><h2 id="comparison-title" tabIndex={-1} data-flow-id="comparison-title">哪些職業值得優先關注？</h2></div><span className="status">{visibleSignals.length} 個職業</span></div>
        <p className="policy-muted">依實驗性結構暴露由高到低排列，並列出已核對的求才變化供交叉判讀。</p>
        <div className="policy-table-head"><span>職業</span><span>結構暴露</span><span>求才年變化</span></div>
        <div role="group" aria-label="選擇職業">{visibleSignals.map((item, index) => <button className="policy-occupation" aria-pressed={selected?.code === item.code} key={item.code} onClick={() => selectOccupation(item.code)}>
          <span className="occupation-label"><span className="occupation-number" aria-label={`序號 ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><span className={`occupation-icon occupation-icon--${item.code}`}><Icon name={OCCUPATION_ICONS[item.code] ?? 'briefcase'} /></span><span><b>{item.name}</b><small>職業大類 {item.code}</small></span></span>
          <span className="unscored"><b>{score(item.structural_exposure_score)}</b><small>{item.structural_exposure_score == null ? '待補資料' : 'A×B'}</small></span>
          <ChangeText text={percent(item.recruitment_yoy_change)} />
        </button>)}</div>
        {selected && <div className="policy-trend"><div className="trend-heading"><span className="trend-icon"><Icon name="chart" /></span><div><h3>{selected.name}的招募訊號</h3><p>整體新登記求才人次 · 前期 → 本期</p></div></div>
          {[{ label: '前期', value: selected.recruitment_vacancies_previous }, { label: '本期', value: selected.recruitment_vacancies_current }].map((row) => <div className="policy-bar" key={row.label}><span>{row.label}</span><div><i style={{ width: `${((row.value ?? 0) / maxVacancies) * 100}%` }} /></div><b>{row.value == null ? '—' : `${number.format(row.value)} 人次`}</b></div>)}
          <p>年度變化 <ChangeText text={percent(selected.recruitment_yoy_change)} /></p>
          <small>同一官方求才序列、同尺度且從零起算；求才人次不是青年新人職缺，也不能單獨推論 AI 因果。</small>
        </div>}
      </section>
    </div>

    if (index === 2) return <aside className="panel policy-diagnosis">
      <div className="section-kicker"><Icon name="sparkles" />職業診斷</div><h2>{selected?.name}</h2>
      <div className="diagnostic-summary"><span className="diagnostic-icon"><Icon name="info" /></span><span className="policy-diagnostic-label">結構暴露 {score(selected?.structural_exposure_score)}／100</span><p>求才人次比前期變化 <ChangeText text={percent(selected?.recruitment_yoy_change)} />；請搭配結構暴露、招募訊號與研究證據判讀，不能單獨歸因於 AI。</p><small>資料信心：{confidence(selected?.data_confidence)}</small></div>
      {flow && <ClaimList flow={flow} />}
      <h3>判讀重點</h3><ul><li>結構暴露由 A×B 計算，用於職業間比較，不是失業率或個人被取代機率。</li><li>H 是官方求才弱化訊號；D 是即時初階職缺機會，兩者各自呈現。</li><li>C 尚無可靠的職業層級量化值，目前獨立標示為缺資料。</li><li>求才增減仍可能受到景氣與招募管道影響，不能直接歸因於 AI。</li>{selected?.data_confidence_reasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      <details data-memory="diagnosis-types"><summary>診斷類型說明</summary><p>證據完整後可區分自動化壓力、AI 增強機會、技能錯配／轉型、非 AI 招募弱化與持續觀察；證據不足時不勉強分類。</p></details>
      {dashboard.public_opinion.length > 0 && <details data-memory="public-opinion"><summary>公眾感受</summary>{dashboard.public_opinion.map((item) => <p key={String(item.label)}>{String(item.label)}：{String(item.value)}{String(item.unit)}（{String(item.survey_year)}）</p>)}</details>}
      <div className="policy-detail-links">{(['資料來源', '清洗紀錄', '估算限制'] as Detail[]).map((kind) => <button className="policy-text-button" key={kind} onClick={(event) => openDetail(kind, event.currentTarget)}><Icon name={DETAIL_ICONS[kind]} />查看{kind}<Icon name="arrow" /></button>)}</div>
    </aside>

    if (index === 3) return <section className="panel" id="research" aria-labelledby="research-title">
      <div className="panel__header"><div><div className="section-kicker"><Icon name="book" />權威證據 AGENT</div><h2 id="research-title">即時檢索、取回原文、核對主張</h2></div><button className="button button--ghost" onClick={runSearch} disabled={Boolean(busy)}>{busy === 'SEARCHING' ? '檢索中…' : '重新即時檢索'}</button></div>
      <div className="policy-evidence-list">{evidence.slice(0, 8).map((item) => <label className="policy-evidence" key={item.evidence_id}><input type="checkbox" checked={selectedEvidence.includes(item.evidence_id)} onChange={() => { setSelectedEvidence((current) => current.includes(item.evidence_id) ? current.filter((id) => id !== item.evidence_id) : [...current, item.evidence_id].slice(-3)); setVerification(null); setPolicy(null) }} /><span><b>{item.title}</b><em>{item.authority_tier} 級候選 · {evidenceRole(item.evidence_role)} · {item.institution} · {item.discovery_source ?? '既有資料'} · {item.freshness}</em><p>{evidenceText(item.finding)}</p><a href={item.url} target="_blank" rel="noreferrer">查看候選來源 <Icon name="external" /></a></span></label>)}</div>
      <button className="button" onClick={runVerification} disabled={Boolean(busy) || !selectedEvidence.length}>{busy === 'VERIFYING' ? '搜尋與 BEDROCK 核對中…' : '執行權威證據 Agent'}</button>
      {verification && <div className="agent-result">
        <span className={`status status--${verification.status.toLowerCase()}`}>{verification.status}</span>
        <p>{verification.agent_steps.join(' → ')}</p>
        <div className="policy-notice" role="status"><Icon name="info" /><span><b>台灣適用性：{applicabilityStatus(verification.taiwan_applicability.status)}</b><br />{verification.taiwan_applicability.conclusion}</span></div>
        {verification.taiwan_applicability.required_local_validation.length > 0 && <details><summary>查看必要的台灣本地驗證</summary><ol>{verification.taiwan_applicability.required_local_validation.map((item) => <li key={item}>{item}</li>)}</ol></details>}
        {verification.harness && <p className="policy-muted">Harness {verification.harness.prompt_version} · 最多 {verification.harness.max_sources} 個來源／每來源 {verification.harness.max_passages_per_source} 段／{verification.harness.deadline_seconds} 秒 · 本次 {verification.harness.duration_ms} ms、{verification.harness.input_tokens + verification.harness.output_tokens} tokens</p>}
        {verification.claims.map((claim) => <details data-memory={claim.claim_id} key={claim.claim_id}><summary>已通過原文認證：{claim.claim}</summary><blockquote>{claim.excerpt}</blockquote><small>{claim.locator} · {claim.support} · {claim.geographic_scope}{claim.content_sha256 ? ` · SHA-256 ${claim.content_sha256.slice(0, 12)}…` : ''}</small><p className="policy-muted">台灣適用性：{claim.applicability_reason}</p>{claim.authority_basis && <p className="policy-muted">認證依據：{claim.authority_basis}</p>}{claim.retrieved_url && <a href={claim.retrieved_url} target="_blank" rel="noreferrer">查看實際取回頁面 <Icon name="external" /></a>}</details>)}
        {verification.gaps.map((gap) => <p className="policy-muted" key={gap}>缺口：{gap}</p>)}
      </div>}
      <h3>判讀與證據關聯</h3>
      {flow && <LinkedEvidence flow={flow} />}
    </section>

    return <section className="panel policy-report" id="policy" aria-labelledby="policy-title">
      <div className="panel__header"><div><div className="section-kicker"><Icon name="report" />政策建議</div><h2 id="policy-title">{selected?.name}的政策方向</h2></div><span className="status">{verification?.approved_evidence_ids.length ? '證據已核對' : '待研究核對'}</span></div>
      {policy && <><p className="policy-notice" role="status"><Icon name="info" />已收到 {policy.options.length} 個政策選項；請逐項確認後再納入會議草稿。</p>{policy.warnings.map((warning) => <p className="policy-muted" key={warning}>台灣適用性限制：{warning}</p>)}</>}
      {flow && <PolicyMeeting flow={flow} />}
      <button className="button" onClick={runPolicy} disabled={Boolean(busy) || !verification?.approved_evidence_ids.length}><Icon name="report" />{busy === 'POLICY' ? '推論中…' : '產生三個政策選項'}</button>
      {!verification?.approved_evidence_ids.length && <p className="policy-muted">先在「論證」頁執行權威證據 Agent；政策 API 只接受已通過來源與出版閘門的證據。</p>}
    </section>
  }

  return <div className="folder-app policy-dashboard" data-modal-open={modalOpen}>
    <header className="folder-topbar">
      <div className="folder-brand"><a className="folder-brand-mark" href="#home" aria-label="返回 rescueBill 首頁"><Icon name="logo" /></a><div><strong>rescueBill</strong><h1 tabIndex={-1}>青年 AI 就業風險政策系統</h1></div></div>
      <label className="folder-occupation">目前職業<select aria-label="目前職業" value={selected?.code ?? ''} onChange={(event) => selectOccupation(event.target.value)} disabled={modalOpen}>{rankedSignals.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <div className="folder-period"><span><Icon name="calendar" />就業資料期 <b>{dgbasPeriod}</b></span><span><Icon name="clock" />最後發布 <b>{time(dashboard.published_at)}</b></span></div>
      <button className="button folder-refresh" disabled={Boolean(busy) || modalOpen} onClick={refresh}><Icon name="refresh" className={busy && !['SEARCHING', 'VERIFYING', 'POLICY'].includes(busy) ? 'is-spinning' : ''} />{busy && !['SEARCHING', 'VERIFYING', 'POLICY'].includes(busy) ? `${busy}…` : '重新抓取資料'}</button>
    </header>
    <div className="folder-context"><span>全國職業大類 <span aria-hidden="true">/</span> 政策目標 18–35 歲 <span aria-hidden="true">/</span> 目前後端資料 20–24 歲 <span aria-hidden="true">/</span> 執行 {dashboard.analysis_run_id}</span><span className="snapshot-badge"><i />{dashboard.overall_status} · 可核對資料快照</span></div>
    <BackendNotice message={notice} busy={Boolean(busy)} onDismiss={dismissNotice} />
    {error && <p className="error-banner" role="alert"><b>流程未完成</b>{error}</p>}
    <FolderWorkspace ref={workspace} contextKey={contextKey} blocked={modalOpen} onExternalNavigate={() => closeDetail(false)} renderPage={renderPage} />

    <dialog id="analysis-detail" ref={dialog} className={`review-dialog${indicatorId ? ' indicator-drawer' : ''}`} data-instant={detailInstant} aria-labelledby="detail-title" onClose={() => setModalOpen(false)} onCancel={(event) => { event.preventDefault(); closeDetail() }} onClick={(event) => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDetail()
      }
    }}>
      <div className="dialog-heading"><span className="section-kicker"><Icon name={evidenceId ? 'book' : DETAIL_ICONS[detail]} />分析詳情</span><button className="dialog-close" autoFocus onClick={() => closeDetail()} aria-label="關閉詳情"><Icon name="close" /></button></div>
      <h2 id="detail-title">{indicatorId ? `${indicatorId} · ${indicatorHelp[indicatorId].title}` : `${selected?.name} · ${evidenceId ? '證據詳情' : detail}`}</h2>
      {indicatorId && <><p className="policy-muted">目前職業：{selected?.name}</p><IndicatorExplanation id={indicatorId} /></>}
      {evidenceId && <EvidenceDetail evidence={analysis?.evidence.find((item) => item.id === evidenceId)} />}
      {!indicatorId && !evidenceId && detail === '資料來源' && <>{dashboard.sources.map((source) => <section key={source.source_id}><h3>{SOURCE_NAMES[source.source_id] ?? source.source_id} <span className={`status status--${source.status.toLowerCase()}`}>{source.status}</span></h3>{source.data_period && <p><b>資料期：</b>{source.data_period}</p>}<p><b>使用：</b>{source.fields_used?.join('、')}</p><p><b>原因：</b>{source.why_used}</p><p><b>限制：</b>{source.limitations}</p>{source.reference_url && <a href={source.reference_url} target="_blank" rel="noreferrer">查看來源說明頁 <Icon name="external" /></a>}</section>)}<p><b>LIVE：</b>本次重抓成功且內容雜湊有變；<b>UNCHANGED：</b>本次仍有重抓，但內容雜湊與上次相同。</p></>}
      {!indicatorId && !evidenceId && detail === '計算方式' && <><p><b>實驗性結構暴露 = 100 × √(A × B)</b></p><p>A：該職業內 20–24 歲就業人數／該職業全部就業人數；P：該職業占全部 20–24 歲就業的比率；B：ILO 生成式 AI 任務暴露 proxy；H：官方求才年減的獨立弱化訊號；D：台灣就業通 AI 初階職缺占比。H 與 D 不納入結構暴露計算，另行呈現。</p><p>目前選取：A={percent(selected?.youth_employment_share)}、P={percent(selected?.occupation_share_of_youth)}、B={score(selected?.exposure_score)}、H={percent(selected?.recruitment_weakening)}、D={percent(selected?.ai_entry_opportunity_rate)}；結構暴露 {score(selected?.structural_exposure_score)}。</p><p>目前以結構暴露作為職業比較值；其他訊號只供交叉判讀。</p><code>{String(metrics.score_version ?? '')}</code></>}
      {!indicatorId && !evidenceId && detail === '清洗紀錄' && <>{dashboard.sources.map((source) => <section key={source.source_id}><h3>{SOURCE_NAMES[source.source_id] ?? source.source_id}</h3><p>{number.format(source.raw_rows)} {source.input_count_label} → {number.format(source.normalized_rows)} {source.output_count_label}</p><ol>{source.processing_steps?.map((step) => <li key={step}>{step}</li>)}</ol><code>SHA-256 {source.content_sha256?.slice(0, 20)}…</code></section>)}<p>JOIN 覆蓋率 {percent(dashboard.cleaning_summary.crosswalk_coverage)}；轉換規則 {dashboard.cleaning_summary.transform_version}。</p></>}
      {!indicatorId && !evidenceId && detail === '估算限制' && <><p>A×B 是跨來源的實驗性結構暴露排序，不是 AI 造成失業的因果估計，也不是個人被取代機率。</p><p>C（台灣產業實際 AI 導入）目前只有產業研究脈絡，缺少可比的「產業→職業」權重，因此不加入結構暴露。</p><p>H 只代表公立就業服務求才弱化，不能歸因於 AI；D 的抽樣、分類與 crosswalk 品質仍需逐項顯示。民意調查只反映主觀感受。</p></>}
    </dialog>
  </div>
}
