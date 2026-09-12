import { useEffect, useMemo, useRef, useState } from 'react'
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
import './policyDashboard.css'

const number = new Intl.NumberFormat('zh-TW')
const percent = (value?: number) => value == null ? '—' : `${(value * 100).toFixed(1)}%`
const score = (value?: number) => value == null ? '—' : value.toFixed(1)
const time = (value?: string) => value
  ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '—'

const SOURCE_NAMES: Record<string, string> = {
  dgbas_employment: '主計總處／20–24 歲就業結構',
  ilo_genai_exposure: 'ILO／生成式 AI 職業暴露',
  taiwanjobs: '台灣就業通／即時初階職缺',
  job104_research: '104／民間 AI 產業訊號',
}

const RESEARCH_QUERIES: Record<string, string> = {
  '3': 'generative AI technicians associate professionals employment skills training policy',
  '4': 'generative AI clerical occupations exposure employment skills training policy',
  '5': 'generative AI service sales occupations employment skills training policy',
}

type Detail = '資料來源' | '計算方式' | '清洗紀錄' | '估算限制'

function meter(value?: number) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value * 100))
  return { width: `${width}%` }
}

function indicator(signal: OccupationSignal, id: string) {
  if (id === 'A') return { value: percent(signal.youth_concentration_index), ratio: signal.youth_concentration_index, note: '本次職類內正規化' }
  if (id === 'B') return { value: score(signal.exposure_score), ratio: signal.exposure_score, note: 'ILO 職務暴露代理值' }
  if (id === 'H') return { value: percent(signal.opportunity_gap), ratio: signal.opportunity_gap, note: '1 − AI 初階職缺占比' }
  if (id === 'D') return { value: percent(signal.ai_entry_opportunity_rate), ratio: signal.ai_entry_opportunity_rate, note: `${number.format(signal.ai_entry_jobs)} 個 AI 相關機會` }
  return { value: '脈絡', ratio: undefined, note: '104 訊號；不冒充量化值' }
}

function firstEvidenceSelection(items: EvidenceItem[]) {
  const preferredKeys = ['refined_index', 'youth_almp']
  const preferred = preferredKeys
    .map((key) => items.find((item) => item.evidence_id.includes(key)))
    .filter((item): item is EvidenceItem => Boolean(item))
  const officialFallback = items.filter(
    (item) => item.authority_tier === 'A' && !preferred.includes(item),
  )
  const authority = [...preferred, ...officialFallback].slice(0, 2)
  const live = items.find((item) => item.freshness === 'LIVE' && !authority.includes(item))
  return [...authority, ...(live ? [live] : [])].slice(0, 3).map((item) => item.evidence_id)
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
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)

  function applyDashboard(value: Dashboard) {
    setDashboard(value)
    const ranked = [...value.occupation_signals].sort(
      (a, b) => (b.transformation_priority_score ?? -1) - (a.transformation_priority_score ?? -1),
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
    (a, b) => (b.transformation_priority_score ?? -1) - (a.transformation_priority_score ?? -1),
  ), [dashboard])
  const visibleSignals = rankedSignals.slice(0, 3)
  const selected = dashboard?.occupation_signals.find((item) => item.code === selectedCode)
    ?? visibleSignals[0]
  const maxJobs = Math.max(...visibleSignals.map((item) => item.total_entry_jobs), 1)

  function openDetail(kind: Detail, button: HTMLButtonElement) {
    trigger.current = button
    setDetail(kind)
    dialog.current?.showModal()
  }

  function closeDetail() {
    dialog.current?.close()
    trigger.current?.focus()
  }

  async function refresh() {
    if (busy) return
    setBusy('QUEUED')
    setError('')
    setNotice('正在重新連線四個來源並建立新的可稽核快照。')
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
        evidence_ids: selectedEvidence.slice(0, 3),
        search_query: researchQuery(selected),
        question: `${selected.name}在生成式 AI 轉型下需要哪些青年就業政策？`,
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
      <h1>青年 AI 就業風險</h1>
      <p>目前沒有已發布快照。按下按鈕後才會查詢真實來源，不以固定數字補畫面。</p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <button className="button button--large" onClick={refresh} disabled={Boolean(busy)}>{busy || '建立真實快照'}</button>
    </section></main>
  }

  const metrics = dashboard.summary_metrics
  return <main className="policy-dashboard" id="overview">
    <header className="topbar">
      <a href="#overview" className="brand"><span className="brand__mark">Y</span>青年 AI 就業風險</a>
      <div className="policy-meta">
        <span>分析族群 <b>20–24 歲</b></span>
        <span>分析執行 <b>{dashboard.analysis_run_id}</b></span>
        <span>最後發布 <b>{time(dashboard.published_at)}</b></span>
      </div>
      <button className="button" disabled={Boolean(busy)} onClick={refresh}>{busy && !['SEARCHING', 'VERIFYING', 'POLICY'].includes(busy) ? `${busy}…` : '重新抓取資料'}</button>
    </header>
    {notice && <p className="policy-notice" role="status">{notice}</p>}
    {error && <p className="error-banner" role="alert"><b>流程未完成</b>{error}</p>}

    <div className="policy-workspace">
      <aside className="panel policy-indicators" aria-label="目前職業核心指標">
        <span className="eyebrow">01 / 核心指標</span><h2>{selected?.name}</h2>
        <div className="policy-risk"><span>AI 轉型優先度</span><strong>{score(selected?.transformation_priority_score)}<small> / 100</small></strong><span>排序訊號，不是失業機率</span></div>
        {([['A', '青年集中程度'], ['B', 'AI 職業暴露'], ['H', 'AI 機會缺口'], ['D', 'AI 人才需求'], ['C', '台灣導入脈絡']] as const).map(([id, label]) => {
          const metric = selected ? indicator(selected, id) : { value: '—', ratio: undefined, note: '' }
          return <div className="policy-metric" key={id}><span><b>{id}</b> {label}</span><strong>{metric.value}</strong><div className="policy-meter"><i style={meter(metric.ratio)} /></div><small>{metric.note}</small></div>
        })}
        <button className="policy-text-button" onClick={(event) => openDetail('計算方式', event.currentTarget)}>查看計算方式 ↗</button>
      </aside>

      <section className="panel policy-comparison" aria-labelledby="comparison-title">
        <div className="panel__header"><div><span className="eyebrow">02 / 職業比較</span><h2 id="comparison-title">哪些職業值得優先關注？</h2></div><span className="status">{visibleSignals.length} 個職業</span></div>
        <p className="policy-muted">依同一次資料快照的轉型優先度排序；不將分數解讀為被 AI 取代機率。</p>
        <div className="policy-table-head"><span>職業</span><span>分數</span><span>AI 初階機會</span></div>
        <div role="group" aria-label="選擇職業">{visibleSignals.map((item) => <button className="policy-occupation" aria-pressed={selected?.code === item.code} key={item.code} onClick={() => { setSelectedCode(item.code); setVerification(null); setPolicy(null) }}><span><small>職業大類 {item.code}</small><b>{item.name}</b></span><span><b>{score(item.transformation_priority_score)}</b><small>{item.priority}</small></span><strong>{percent(item.ai_entry_opportunity_rate)}</strong></button>)}</div>
        {selected && <div className="policy-trend"><h3>{selected.name}的即時職缺訊號</h3><p>台灣就業通本次有效初階職缺；不是歷史年增率。</p>
          {[{ label: '全部', value: selected.total_entry_jobs }, { label: 'AI', value: selected.ai_entry_jobs }].map((row) => <div className="policy-bar" key={row.label}><span>{row.label}</span><div><i style={{ width: `${row.value / maxJobs * 100}%` }} /></div><b>{number.format(row.value)} 個機會</b></div>)}
          <small>主計總處提供青年職業結構，ILO 提供暴露代理值，台灣就業通提供當期職缺；三者依職業大類 Join。</small>
        </div>}
      </section>

      <aside className="panel policy-diagnosis">
        <span className="eyebrow">03 / 職業診斷</span><h2>{selected?.name}</h2>
        <span className="policy-diagnostic-label">{selected?.priority === 'high' ? '優先介入' : selected?.priority === 'medium' ? '次優先' : '持續觀察'}</span>
        <p>本次優先度 {score(selected?.transformation_priority_score)}；20–24 歲就業 {number.format(selected?.youth_employed ?? 0)} 人，AI 初階機會占比 {percent(selected?.ai_entry_opportunity_rate)}。</p>
        <h3>判讀重點</h3><ul>
          <li>A、B、H 進入分數；D 正向需求轉為 H=1−D。</li>
          <li>C 目前只有產業脈絡，避免假裝成職業量化資料。</li>
          <li>公眾感受獨立呈現，不冒充客觀風險或因果。</li>
        </ul>
        <details><summary>公眾感受</summary>{dashboard.public_opinion.map((item) => <p key={String(item.label)}>{String(item.label)}：{String(item.value)}{String(item.unit)}（{String(item.survey_year)}）</p>)}</details>
        <div className="policy-detail-links">{(['資料來源', '清洗紀錄', '估算限制'] as Detail[]).map((kind) => <button className="policy-text-button" key={kind} onClick={(event) => openDetail(kind, event.currentTarget)}>查看{kind} ↗</button>)}</div>
      </aside>
    </div>

    <div className="policy-bottom">
      <section className="panel" aria-labelledby="research-title">
        <div className="panel__header"><div><span className="eyebrow">04 / 權威證據 AGENT</span><h2 id="research-title">即時檢索、取回原文、核對主張</h2></div><button className="button button--ghost" onClick={runSearch} disabled={Boolean(busy)}>{busy === 'SEARCHING' ? '檢索中…' : '重新即時檢索'}</button></div>
        <div className="policy-evidence-list">{evidence.slice(0, 6).map((item) => <label className="policy-evidence" key={item.evidence_id}><input type="checkbox" checked={selectedEvidence.includes(item.evidence_id)} onChange={() => { setSelectedEvidence((current) => current.includes(item.evidence_id) ? current.filter((id) => id !== item.evidence_id) : [...current, item.evidence_id].slice(-3)); setVerification(null); setPolicy(null) }} /><span><b>{item.title}</b><em>{item.authority_tier} 級 · {item.institution} · {item.freshness}</em><p>{item.finding ?? '目前只有索引 metadata；Agent 不會把它直接當成主張證據。'}</p><a href={item.url} target="_blank" rel="noreferrer">查看原文 ↗</a></span></label>)}</div>
        <button className="button" onClick={runVerification} disabled={Boolean(busy) || !selectedEvidence.length}>{busy === 'VERIFYING' ? '搜尋與 BEDROCK 核對中…' : '執行權威證據 Agent'}</button>
        {verification && <div className="agent-result"><span className={`status status--${verification.status.toLowerCase()}`}>{verification.status}</span><p>{verification.agent_steps.join(' → ')}</p>{verification.claims.map((claim) => <details key={claim.claim_id}><summary>{claim.claim}</summary><blockquote>{claim.excerpt}</blockquote><small>{claim.locator} · {claim.support}</small></details>)}{verification.gaps.map((gap) => <p className="policy-muted" key={gap}>缺口：{gap}</p>)}</div>}
      </section>

      <section className="panel" aria-labelledby="policy-title">
        <div className="panel__header"><div><span className="eyebrow">05 / 政策建議</span><h2 id="policy-title">{selected?.name}的政策選項</h2></div><span className="status">BEDROCK</span></div>
        {!policy && <><h3>先通過權威證據閘門，再收斂政策</h3><p>政策 API 只接受本次分析版本中、已被 Agent 取回原文並通過 publication gate 的證據 ID。</p><button className="button" onClick={runPolicy} disabled={Boolean(busy) || !verification?.approved_evidence_ids.length}>{busy === 'POLICY' ? '推論中…' : '產生三個政策選項'}</button><p className="policy-muted">不匯出報告；現場直接比較機制、執行、KPI、風險與限制。</p></>}
        {policy && <div className="policy-options">{policy.options.map((option, index) => <article key={option.title}><span>0{index + 1}</span><h3>{option.title}</h3><p><b>{option.target_group}</b>｜{option.mechanism}</p><ol>{option.implementation.map((step) => <li key={step}>{step}</li>)}</ol><details><summary>證據、風險與限制</summary><p>證據：{option.evidence_ids.join('、')}</p>{[...option.risks, ...option.limitations].map((item) => <p key={item}>{item}</p>)}</details></article>)}</div>}
      </section>
    </div>

    <dialog ref={dialog} className="review-dialog" aria-labelledby="detail-title" onCancel={(event) => { event.preventDefault(); closeDetail() }}>
      <button className="button" autoFocus onClick={closeDetail}>關閉詳情</button><h2 id="detail-title">{selected?.name} · {detail}</h2>
      {detail === '資料來源' && <>{dashboard.sources.map((source) => <section key={source.source_id}><h3>{SOURCE_NAMES[source.source_id] ?? source.source_id} <span className={`status status--${source.status.toLowerCase()}`}>{source.status}</span></h3><p><b>使用：</b>{source.fields_used?.join('、')}</p><p><b>原因：</b>{source.why_used}</p><p><b>限制：</b>{source.limitations}</p>{source.reference_url && <a href={source.reference_url} target="_blank" rel="noreferrer">查看來源說明頁 ↗</a>}</section>)}<p><b>LIVE：</b>本次重抓成功且內容雜湊有變；<b>UNCHANGED：</b>本次仍有重抓，但內容雜湊與上次相同。</p></>}
      {detail === '計算方式' && <><p><b>AI 轉型優先度 = 100 × ∛(A × B × H)</b></p><p>A：20–24 歲在該職業的就業占比，除以本次最高職業占比；B：ILO 生成式 AI 暴露分數；D：台灣就業通 AI 相關初階職缺占比；H=1−D。</p><p>目前選取：A={percent(selected?.youth_concentration_index)}、B={score(selected?.exposure_score)}、H={percent(selected?.opportunity_gap)}，結果 {score(selected?.transformation_priority_score)}。</p><p>{String(metrics.metric_warning ?? '')}</p><code>{String(metrics.score_version ?? '')}</code></>}
      {detail === '清洗紀錄' && <>{dashboard.sources.map((source) => <section key={source.source_id}><h3>{SOURCE_NAMES[source.source_id] ?? source.source_id}</h3><p>{number.format(source.raw_rows)} {source.input_count_label} → {number.format(source.normalized_rows)} {source.output_count_label}</p><ol>{source.processing_steps?.map((step) => <li key={step}>{step}</li>)}</ol><code>SHA-256 {source.content_sha256?.slice(0, 20)}…</code></section>)}<p>JOIN 覆蓋率 {percent(dashboard.cleaning_summary.crosswalk_coverage)}；轉換規則 {dashboard.cleaning_summary.transform_version}。</p></>}
      {detail === '估算限制' && <><p>這是跨來源的政策排序指標，不是 AI 造成失業的因果估計，也不是個人被取代機率。</p><p>C（台灣產業實際 AI 導入）目前只有 104 產業研究脈絡，缺少可比的「產業→職業」權重，所以沒有硬塞進分數。</p><p>民意調查僅反映主觀感受；職缺平台也不代表全體勞動市場。所有限制都保留在來源卡與政策輸出。</p></>}
    </dialog>
    <footer>青年問題 → 真實資料 → 清洗與 JOIN → 創新指標 → 權威原文 → 政策選項</footer>
  </main>
}
