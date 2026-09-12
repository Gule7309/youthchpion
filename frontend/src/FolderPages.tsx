import { annualChange, pendingIndicators, snapshot } from './verifiedSnapshot'
import { Icon, type IconName } from './Icon'
import { AnalysisSummary, ClaimList, LinkedEvidence, PolicyMeeting, type DecisionFlow } from './DecisionPanels'
export const number = new Intl.NumberFormat('zh-TW')
export const percentage = (a: number, b: number) => {
  const value = annualChange(a, b)
  return value == null ? '—' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
}
const chartMaximum = Math.max(...snapshot.occupations.flatMap(o => [o.previous, o.current]))
const metrics = [
  ['S', '結構性 AI 暴露'], ['A', '青年集中程度'], ['B', 'AI 能力暴露'],
  ['C', '台灣 AI 導入訊號'], ['H', '招募弱化'], ['D', 'AI 人才需求'],
] as const
const occupationIcons: Record<string, IconName> = { '4': 'briefcase', '2': 'book', '5': 'users' }
export type Detail = '資料來源' | '計算方式' | '清洗紀錄' | '估算方式'
export const detailIcons: Record<Detail, IconName> = {
  資料來源: 'database', 計算方式: 'formula', 清洗紀錄: 'filter', 估算方式: 'info',
}

export type Occupation = typeof snapshot.occupations[number]
export type PageProps = { occupation: Occupation; code: string; setCode: (code: string) => void; openDetail: (kind: Detail, button: HTMLButtonElement) => void; flow: DecisionFlow }

export function IndicatorsPage({ occupation, openDetail, flow }: PageProps) { return <aside className="panel policy-indicators" aria-label="目前職業核心指標">
          <div className="indicator-heading"><h2>{occupation.name}</h2><div className="section-kicker"><Icon name="chart" /><span>核心指標</span></div></div>
          <div className="indicator-overview">
          <AnalysisSummary flow={flow} />
          <div className="indicator-metrics">
          {metrics.map(([id, label]) => <div className="policy-metric" key={id}>
            <span className={`metric-code metric-code--${id}`}>{id}</span>
            <div><b className="metric-name">{label}</b><small>{id === 'H' ? '歷史已取得 · 方法待核定' : '待核對'}</small></div>
            <strong aria-label={`${label}尚無核定分數`}>—</strong>
          </div>)}</div></div>
          <button className="policy-text-button" onClick={e => openDetail('計算方式', e.currentTarget)}>
            <Icon name="formula" />查看計算方式<Icon name="arrow" />
          </button>
        </aside> }

export function RiskPage({ occupation, code, setCode, flow }: PageProps) { return <div className="risk-layout"><aside className="risk-overview"><span className="section-kicker">目前職業的風險</span><h2>{occupation.name}</h2><div className="policy-risk">
            <div className="risk-label"><span>AI 就業風險</span><Icon name="sparkles" /></div>
            <strong>—<small> / 100</small></strong><span className="risk-caption">資料不足，暫不評分</span>
          </div><p className="policy-muted">此模型為早期預警指標，不是失業機率。</p><button className="policy-text-button" onClick={e => flow.navigate(2, 'claim-recruitment-change', e.detail === 0)}>查看判讀原因<Icon name="arrow" /></button></aside><section className="panel policy-comparison" id="comparison" aria-labelledby="comparison-title">
          <div className="panel__header"><div><div className="section-kicker"><Icon name="users" /><span>職業比較</span></div><h2 id="comparison-title" tabIndex={-1} data-flow-id="comparison-title">哪些職業值得優先關注？</h2></div><span className="status">3 個職業</span></div>
          <p className="policy-muted">Risk 尚未核定，暫不排名；先比較已核對的招募訊號。</p>
          <div className="policy-table-head"><span>職業</span><span>Risk</span><span>求才年變化</span></div>
          <div role="group" aria-label="選擇職業">
            {snapshot.occupations.map(o => <button className="policy-occupation" aria-pressed={code === o.code} key={o.code} onClick={() => setCode(o.code)}>
              <span className="occupation-label"><span className={`occupation-icon occupation-icon--${o.code}`}><Icon name={occupationIcons[o.code]} /></span><span><b>{o.name}</b><small>職業大類 {o.code}</small></span></span>
              <span className="unscored">—<small>待核對</small></span>
              <strong>{percentage(o.previous, o.current)}</strong>
            </button>)}
          </div>
          <div className="policy-trend">
            <div className="trend-heading"><span className="trend-icon"><Icon name="chart" /></span><div><h3>{occupation.name}的招募訊號</h3><p>整體新登記求才人次 · 2024 → 2025</p></div></div>
            {[{ year: 2024, value: occupation.previous }, { year: 2025, value: occupation.current }].map(row => <div className="policy-bar" key={row.year}>
              <span>{row.year}</span><div><i style={{ width: `${row.value / chartMaximum * 100}%` }} /></div><b>{number.format(row.value)} 人次</b>
            </div>)}
            <small>同一尺度、從零起算。全年齡求才，不是青年新人招募或 AI 因果效果。</small>
          </div>
        </section></div> }

export function DiagnosisPage({ occupation, openDetail, flow }: PageProps) { return <aside className="panel policy-diagnosis">
          <div className="section-kicker"><Icon name="sparkles" /><span>職業診斷</span></div><h2>{occupation.name}</h2>
          <div className="diagnostic-summary"><span className="diagnostic-icon"><Icon name="info" /></span><span className="policy-diagnostic-label">證據不足</span><p>目前可觀察到招募年變化 {percentage(occupation.previous, occupation.current)}，但尚不足以歸因於 AI。</p></div>
          <ClaimList flow={flow} />
          <h3>判讀重點</h3><ul><li>A／B／C 尚待核對，無完整 S 與 Risk。</li><li>D 需求占比及排名尚未建立。</li><li>求才上升不代表低風險；下降不代表被取代。</li></ul>
          <details data-memory="diagnosis-types"><summary>診斷類型說明</summary><p>核定後可區分自動化壓力、AI 增強機會、技能錯配／轉型、非 AI 招募弱化、持續觀察。證據不足不歸入任何風險類型。</p></details>
          <div className="policy-detail-links">
            {(['資料來源', '清洗紀錄', '估算方式'] as Detail[]).map(kind => <button className="policy-text-button" key={kind} onClick={e => openDetail(kind, e.currentTarget)}>
              <Icon name={detailIcons[kind]} />查看{kind}<Icon name="arrow" />
            </button>)}
          </div>
        </aside> }

export function EvidencePage({ occupation, openDetail, flow }: PageProps) { return <div><section className="panel" id="research" aria-labelledby="research-title">
          <div className="section-kicker"><Icon name="book" /><span>研究證據</span></div><h2 id="research-title">{occupation.name}的研究依據</h2>
          <LinkedEvidence flow={flow} />
          <h3>方法與背景閱讀</h3>
          <div className="evidence-background-grid">
          <div className="policy-evidence"><span className="evidence-icon evidence-icon--blue"><Icon name="book" /></span><div><b>ILO · 職業 AI 暴露研究</b><span className="evidence-type">模型方法來源</span><p>用於核對 B 的國際代理指標；不直接作為台灣該職業失業或政策成效的證明。</p><a href={pendingIndicators[1].source} target="_blank" rel="noreferrer">查看原文<Icon name="external" /></a></div></div>
          <div className="policy-evidence"><span className="evidence-icon evidence-icon--green"><Icon name="sparkles" /></span><div><b>AIF · 台灣產業 AI 調查</b><span className="evidence-type">產業背景來源</span><p>Ready AI 包含準備與試驗；須經產業 → 職業加權映射，不能直接當成職業實際導入率。</p><a href={pendingIndicators[2].source} target="_blank" rel="noreferrer">查看原文<Icon name="external" /></a></div></div>
          </div><small>以上為方法／背景來源。職業專屬的支持、反對證據與政策研究原文定位仍待補齊，不冒充專家背書。</small>
        </section><div className="evidence-actions">{(['資料來源','計算方式','清洗紀錄','估算方式'] as Detail[]).map(kind => <button className="policy-text-button" key={kind} onClick={e=>openDetail(kind,e.currentTarget)}><Icon name={detailIcons[kind]}/>查看{kind}<Icon name="arrow"/></button>)}</div></div> }

export function ReportPage({ occupation, flow }: PageProps) { return <section className="panel policy-report" id="policy" aria-labelledby="policy-title">
          <div className="panel__header"><div><div className="section-kicker"><Icon name="report" /><span>政策建議</span></div><h2 id="policy-title">{occupation.name}的政策方向</h2></div><span className="status">待研究核對</span></div>
          <PolicyMeeting flow={flow} />
          <button className="button" disabled aria-describedby="report-reason"><Icon name="report" />產生完整政策報告</button>
          <p id="report-reason" className="policy-muted">AI 完整報告服務尚未就緒；上方「會議草稿」只整理目前已有的可核對內容。</p>
        </section> }
