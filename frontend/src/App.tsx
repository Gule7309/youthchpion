import { useEffect, useMemo, useState } from 'react'
import { generatePolicy, getDashboard, refreshDashboard, searchEvidence } from './api'
import type {
  Dashboard,
  EvidenceItem,
  OccupationSignal,
  PolicyResponse,
  SourceSnapshot,
} from './types'

const SOURCE_NAMES: Record<string, string> = {
  dgbas_employment: '主計總處／就業結構',
  ilo_genai_exposure: 'ILO／AI 職業暴露',
  taiwanjobs: '台灣就業通／即時職缺',
  job104_research: '104／民間產業訊號',
}

const number = new Intl.NumberFormat('zh-TW')
const percent = (value?: number) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`)
const time = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  )

function StatusBadge({ value }: { value: string }) {
  return <span className={`status status--${value.toLowerCase()}`}>{value}</span>
}

function MetricCard({ label, value, note, accent = false }: {
  label: string
  value: string
  note: string
  accent?: boolean
}) {
  return (
    <article className={`panel metric-card ${accent ? 'panel--accent' : ''}`}>
      <span className="eyebrow">{label}</span>
      <strong className="metric-card__value">{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function IndicatorMatrix({ signals, selected, onSelect }: {
  signals: OccupationSignal[]
  selected: string
  onSelect: (code: string) => void
}) {
  const width = 680
  const height = 330
  const padding = 44
  const maxEmployment = Math.max(...signals.map((item) => item.youth_employment_share ?? 0), 0.01)
  const maxExposure = Math.max(...signals.map((item) => item.exposure_score ?? 0), 0.01)
  return (
    <article className="panel matrix-panel">
      <div className="panel__header">
        <div>
          <span className="eyebrow">01 / 指標雷達</span>
          <h2>20–24 歲青年就業集中度 × AI 暴露</h2>
        </div>
        <div className="legend"><i />圓越大＝即時初階職缺越多</div>
      </div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="青年就業與AI暴露矩陣">
          <line x1={padding} x2={width - 20} y1={height - padding} y2={height - padding} />
          <line x1={padding} x2={padding} y1={20} y2={height - padding} />
          <line className="guide" x1={width / 2} x2={width / 2} y1={20} y2={height - padding} />
          <line className="guide" x1={padding} x2={width - 20} y1={height / 2} y2={height / 2} />
          <text x={padding} y={16}>AI 暴露分數 ↑</text>
          <text x={width - 208} y={height - 12}>20–24 歲就業集中度 →</text>
          {signals.map((item) => {
            const x = padding + ((item.youth_employment_share ?? 0) / maxEmployment) * (width - padding - 42)
            const y = height - padding - ((item.exposure_score ?? 0) / maxExposure) * (height - padding - 34)
            const radius = 8 + Math.min(16, Math.sqrt(item.total_entry_jobs) / 2.4)
            return (
              <g
                key={item.code}
                className={`plot-point plot-point--${item.priority} ${selected === item.code ? 'is-selected' : ''}`}
                onClick={() => onSelect(item.code)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === 'Enter' && onSelect(item.code)}
              >
                <circle cx={x} cy={y} r={radius} />
                <text x={x + radius + 5} y={y + 4}>{item.code}</text>
                <title>{`${item.name}｜就業占比 ${percent(item.youth_employment_share)}｜暴露 ${item.exposure_score}`}</title>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="occupation-tabs">
        {signals.map((item) => (
          <button
            className={selected === item.code ? 'active' : ''}
            key={item.code}
            onClick={() => onSelect(item.code)}
          >
            <b>{item.code}</b>{item.name}
          </button>
        ))}
      </div>
    </article>
  )
}

function SourceCard({ source }: { source: SourceSnapshot }) {
  return (
    <details className="source-row">
      <summary>
        <div>
          <span>{SOURCE_NAMES[source.source_id] ?? source.source_id}</span>
          <small>
            {source.raw_rows.toLocaleString()} {source.input_count_label ?? '筆輸入'} →{' '}
            {source.normalized_rows.toLocaleString()} {source.output_count_label ?? '筆輸出'}
          </small>
        </div>
        <div className="source-row__status">
          <StatusBadge value={source.status} />
          <small>{time(source.retrieved_at)}</small>
        </div>
      </summary>
      <div className="source-detail">
        <strong>{source.dataset_name ?? '來源資料集'}</strong>
        {Boolean(source.fields_used?.length) && (
          <section>
            <h3>實際使用欄位</h3>
            <p>{source.fields_used?.join('、')}</p>
          </section>
        )}
        {source.why_used && (
          <section>
            <h3>為什麼使用</h3>
            <p>{source.why_used}</p>
          </section>
        )}
        <ol>
          {(source.processing_steps ?? []).map((step) => <li key={step}>{step}</li>)}
        </ol>
        {source.limitations && (
          <section>
            <h3>資料限制</h3>
            <p>{source.limitations}</p>
          </section>
        )}
        {source.message && <p>{source.message}</p>}
        <dl>
          <div><dt>HTTP</dt><dd>{source.http_status ?? '—'}</dd></div>
          <div><dt>SHA-256</dt><dd>{source.content_sha256?.slice(0, 16) ?? '—'}…</dd></div>
        </dl>
        <div className="source-detail__links">
          {source.reference_url && <a href={source.reference_url} target="_blank" rel="noreferrer">查看官方來源</a>}
        </div>
      </div>
    </details>
  )
}

function EvidencePanel({ items, selectedIds, onToggle, onSearch, searching }: {
  items: EvidenceItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onSearch: () => void
  searching: boolean
}) {
  return (
    <article className="panel evidence-panel">
      <div className="panel__header">
        <div>
          <span className="eyebrow">02 / 權威證據</span>
          <h2>可追溯的研究與專家來源</h2>
        </div>
        <button className="button button--ghost" onClick={onSearch} disabled={searching}>
          {searching ? '即時檢索中…' : '重新即時檢索'}
        </button>
      </div>
      <div className="evidence-list">
        {items.map((item) => (
          <div className="evidence-row" key={item.evidence_id}>
            <label className="check">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.evidence_id)}
                onChange={() => onToggle(item.evidence_id)}
              />
              <span />
            </label>
            <div>
              <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              <p>
                <b className={`tier tier--${(item.authority_tier ?? 'B').toLowerCase()}`}>
                  {item.authority_tier ?? 'B'} 級
                </b>
                {item.institution} · {item.evidence_type} · {item.published_at ?? '日期未提供'}
              </p>
              <small>{item.limitations}</small>
            </div>
            <StatusBadge value={item.freshness} />
          </div>
        ))}
        {!items.length && <p className="empty-copy">尚無證據，請執行即時檢索。</p>}
      </div>
    </article>
  )
}

function PolicyPanel({ policy, loading, onGenerate, canGenerate }: {
  policy: PolicyResponse | null
  loading: boolean
  onGenerate: () => void
  canGenerate: boolean
}) {
  return (
    <section className="policy-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">03 / 政策收斂</span>
          <h2>三個可比較的政策選項</h2>
        </div>
        <button className="button" onClick={onGenerate} disabled={!canGenerate || loading}>
          {loading ? 'BEDROCK 推論中…' : '產生政策選項'}
        </button>
      </div>
      {!policy && (
        <div className="panel empty-policy">
          選擇一個職業與至少一筆證據後，才會向 Bedrock 發出真實請求；未設定模型時不顯示假回答。
        </div>
      )}
      {policy && (
        <div className="policy-grid">
          {policy.options.map((option, index) => (
            <article className="panel policy-card" key={option.title}>
              <span className="policy-card__index">0{index + 1}</span>
              <h3>{option.title}</h3>
              <p className="policy-card__target">{option.target_group}</p>
              <p>{option.mechanism}</p>
              <h4>執行</h4>
              <ol>{option.implementation.map((step) => <li key={step}>{step}</li>)}</ol>
              <h4>證據</h4>
              <div className="citation-row">
                {option.evidence_ids.map((id) => <code key={id}>{id}</code>)}
              </div>
              <details><summary>風險與限制</summary>{[...option.risks, ...option.limitations].map((item) => <p key={item}>{item}</p>)}</details>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [selectedCode, setSelectedCode] = useState('4')
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([])
  const [policy, setPolicy] = useState<PolicyResponse | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard()
      .then((value) => {
        setDashboard(value)
        setEvidence(value.evidence_preview)
        setSelectedEvidence(value.evidence_preview.slice(0, 3).map((item) => item.evidence_id))
        if (value.occupation_signals.length && !value.occupation_signals.some((item) => item.code === '4')) {
          setSelectedCode(value.occupation_signals[0].code)
        }
      })
      .catch(() => undefined)
  }, [])

  const selectedSignal = useMemo(
    () => dashboard?.occupation_signals.find((item) => item.code === selectedCode),
    [dashboard, selectedCode],
  )

  async function handleRefresh() {
    setError('')
    setBusy('QUEUED')
    try {
      const value = await refreshDashboard(setBusy)
      setDashboard(value)
      setEvidence(value.evidence_preview)
      setSelectedEvidence(value.evidence_preview.slice(0, 3).map((item) => item.evidence_id))
      setPolicy(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新失敗')
    } finally {
      setBusy('')
    }
  }

  async function handleEvidenceSearch() {
    setError('')
    setBusy('EVIDENCE')
    try {
      const items = await searchEvidence('generative AI youth employment skills training policy')
      setEvidence(items)
      setSelectedEvidence(items.slice(0, 3).map((item) => item.evidence_id))
      setPolicy(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '證據檢索失敗')
    } finally {
      setBusy('')
    }
  }

  async function handlePolicy() {
    if (!dashboard || !selectedSignal) return
    setError('')
    setBusy('POLICY')
    try {
      setPolicy(await generatePolicy({
        analysis_run_id: dashboard.analysis_run_id,
        occupation_code: selectedSignal.code,
        policy_goal: '降低青年在生成式 AI 轉型中的技能與優質就業落差',
        evidence_ids: selectedEvidence,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '政策生成失敗')
    } finally {
      setBusy('')
    }
  }

  const metrics = dashboard?.summary_metrics
  const opinion = dashboard?.public_opinion[0]
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand__mark">Y</span><span>YOUTH / AI<br />POLICY RADAR</span></a>
        <div className="topbar__meta">
          <span>ISSUE</span><b>青年就業 × AI 轉型</b>
          <span>RUN</span><b>{dashboard?.analysis_run_id ?? 'NOT PUBLISHED'}</b>
          <span>UPDATED</span><b>{dashboard ? time(dashboard.published_at) : '—'}</b>
        </div>
        <button className="button" onClick={handleRefresh} disabled={Boolean(busy)}>
          {busy && busy !== 'EVIDENCE' && busy !== 'POLICY' ? `${busy}…` : '更新真實資料'}
        </button>
      </header>

      {error && <div className="error-banner" role="alert"><b>流程未完成</b>{error}</div>}
      {!dashboard ? (
        <section className="first-run">
          <span className="eyebrow">NO FIXTURE / NO PRETEND DATA</span>
          <h1>先建立第一份<br />真實分析快照</h1>
          <p>系統會即時查詢主計總處、ILO、台灣就業通、104、OpenAlex 與 Crossref。</p>
          <button className="button button--large" onClick={handleRefresh} disabled={Boolean(busy)}>
            {busy ? `${busy}…` : '開始更新'}
          </button>
        </section>
      ) : (
        <>
          <section className="dashboard-grid" id="top">
            <div className="metrics-stack">
              <MetricCard
                label="20–24 青年就業"
                value={number.format(Number(metrics?.youth_employed_20_24 ?? 0))}
                note={`主分析族群 · 25–29 歲另列 ${number.format(Number(metrics?.youth_employed_25_29 ?? 0))} 人`}
                accent
              />
              <MetricCard
                label="青年 AI 暴露負荷"
                value={Number(metrics?.youth_ai_exposure_load ?? 0).toFixed(3)}
                note="就業集中度 × ILO 暴露分數"
              />
              <MetricCard
                label="公眾感受"
                value={`${String(opinion?.value ?? '—')}%`}
                note="20–29 歲自評可能受取代 · 版本化調查"
              />
            </div>

            <IndicatorMatrix signals={dashboard.occupation_signals} selected={selectedCode} onSelect={setSelectedCode} />

            <aside className="right-stack">
              <article className="panel selected-panel">
                <span className="eyebrow">SELECTED / {selectedSignal?.code}</span>
                <h2>{selectedSignal?.name}</h2>
                <div className="selected-panel__metrics">
                  <div><b>{percent(selectedSignal?.youth_employment_share)}</b><span>20–24 職業分布占比</span></div>
                  <div><b>{selectedSignal?.exposure_score?.toFixed(3) ?? '—'}</b><span>ILO 暴露分數</span></div>
                  <div><b>{percent(selectedSignal?.ai_entry_opportunity_rate)}</b><span>AI 初階機會</span></div>
                </div>
                <p>
                  20–24 歲就業 {number.format(selectedSignal?.youth_employed ?? 0)} 人；25–29 歲比較組{' '}
                  {number.format(selectedSignal?.youth_employed_25_29 ?? 0)} 人。暴露分數代表職務轉型可能性，不等於失業或被取代機率。
                </p>
              </article>
              <article className="panel sources-panel">
                <div className="panel__header"><div><span className="eyebrow">LIVE SOURCES</span><h2>資料新鮮度</h2><small>點開查看使用欄位、處理規則與限制</small></div><StatusBadge value={dashboard.overall_status} /></div>
                {dashboard.sources.map((source) => <SourceCard key={source.source_id} source={source} />)}
                <div className="freshness-help">
                  <p><StatusBadge value="LIVE" /> 本次重新查詢成功，內容相較上一版有變動，或是首次建立快照。</p>
                  <p><StatusBadge value="UNCHANGED" /> 本次仍有重新連線並下載；SHA-256 與上一個成功版本相同，不是 cache 或假資料。</p>
                </div>
              </article>
            </aside>

            <article className="panel cleaning-panel">
              <div className="panel__header"><div><span className="eyebrow">CLEANING AUDIT</span><h2>本次實際處理紀錄</h2></div><code>{dashboard.cleaning_summary.transform_version}</code></div>
              <p className="cleaning-intro">每次更新都重新擷取來源，再解析欄位、切分 20–24 歲、統一職類、去重與排除過期資料。不同來源的觀測單位不同，因此分來源呈現輸入與輸出，不把「列、職業觀測、職缺、文章」加成一個誤導性的總數。</p>
              <div className="processing-ledger">
                {dashboard.sources.map((source) => (
                  <div className="processing-row" key={source.source_id}>
                    <b>{SOURCE_NAMES[source.source_id] ?? source.source_id}</b>
                    <span>{number.format(source.raw_rows)} {source.input_count_label ?? '筆輸入'}</span>
                    <i>→</i>
                    <span>{number.format(source.normalized_rows)} {source.output_count_label ?? '筆輸出'}</span>
                  </div>
                ))}
              </div>
              <div className="quality-stats">
                <div><b>{percent(dashboard.cleaning_summary.crosswalk_coverage)}</b><span>職類 JOIN 覆蓋率</span></div>
                <div><b>{dashboard.cleaning_summary.duplicates_removed}</b><span>移除重複職缺</span></div>
                <div><b>{dashboard.cleaning_summary.expired_removed}</b><span>排除過期職缺</span></div>
                <div><b>{dashboard.cleaning_summary.missing_occupation}</b><span>缺少職稱</span></div>
              </div>
              <div className="cleaning-removals">
                <span>轉換規則版本 {dashboard.cleaning_summary.transform_version}</span>
                <span>主分析 20–24 歲；25–29 歲僅作比較</span>
              </div>
              <details>
                <summary>檢視未對齊類別與轉換規則</summary>
                <p>{dashboard.cleaning_summary.unmatched_categories.join('、') || '本次無未對齊類別'}</p>
                {dashboard.cleaning_summary.before_after.map((item) => <p key={item.before}><code>{item.before}</code> → {item.after}</p>)}
              </details>
            </article>
          </section>

          <EvidencePanel
            items={evidence}
            selectedIds={selectedEvidence}
            onToggle={(id) => setSelectedEvidence((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-8))}
            onSearch={handleEvidenceSearch}
            searching={busy === 'EVIDENCE'}
          />

          <PolicyPanel policy={policy} loading={busy === 'POLICY'} onGenerate={handlePolicy} canGenerate={selectedEvidence.length > 0} />
        </>
      )}
      <footer>YOUTHCHPION / DECISION SUPPORT PROTOTYPE · ALL METRICS TRACEABLE TO SOURCE SNAPSHOTS</footer>
    </main>
  )
}
