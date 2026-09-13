import { annualChange, snapshot } from './verifiedSnapshot'
import { Icon, type IconName } from './Icon'
import { ChangeText } from './AnnualChange'
import { EvidenceReview } from './EvidenceReview'
import type { IndicatorId } from './indicatorHelp'
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
export type Detail = '資料來源' | '計算方式' | '清洗紀錄' | '估算方式' | `指標 ${IndicatorId}`
export const detailIcons: Record<Detail, IconName> = {
  資料來源: 'database', 計算方式: 'formula', 清洗紀錄: 'filter', 估算方式: 'info',
  '指標 S': 'formula', '指標 A': 'users', '指標 B': 'sparkles', '指標 C': 'briefcase', '指標 H': 'chart', '指標 D': 'database',
}

export type Occupation = typeof snapshot.occupations[number]
export type PageProps = { occupation: Occupation; code: string; setCode: (code: string) => void; openDetail: (kind: Detail, button: HTMLButtonElement, instant?: boolean) => void; flow: DecisionFlow }

export function IndicatorsPage({ occupation, openDetail, flow }: PageProps) { return <aside className="panel policy-indicators" aria-label="目前職業核心指標">
          <div className="indicator-heading"><h2>{occupation.name}</h2><div className="section-kicker"><Icon name="chart" /><span>核心指標</span></div></div>
          <div className="indicator-overview">
          <AnalysisSummary flow={flow} />
          <div className="indicator-metrics">
          {metrics.map(([id, label]) => <button type="button" className="policy-metric indicator-help-trigger" key={id} aria-label={`查看 ${id} ${label}的意涵與計算方式`} aria-haspopup="dialog" aria-controls="analysis-detail" onClick={e => openDetail(`指標 ${id}`, e.currentTarget, e.detail === 0)}>
            <span className={`metric-code metric-code--${id}`}>{id}</span>
            <span><b className="metric-name">{label}</b><small>{id === 'H' ? '歷史已取得 · 方法待核定' : '待核對'}</small><span className="indicator-help-link">意涵與計算方式 ↗</span></span>
            <strong aria-label={`${label}尚無核定分數`}>—</strong>
          </button>)}</div></div>
          <button className="policy-text-button" onClick={e => openDetail('計算方式', e.currentTarget)}>
            <Icon name="formula" />查看計算方式<Icon name="arrow" />
          </button>
        </aside> }

export function RiskPage({ occupation, code, setCode, flow }: PageProps) { return <div className="risk-layout"><aside className="risk-overview"><span className="section-kicker">目前職業的結構暴露</span><h2>{occupation.name}</h2><div className="policy-risk">
            <div className="risk-label"><span>實驗性結構暴露</span><Icon name="sparkles" /></div>
            <strong>—<small> / 100</small></strong><span className="risk-caption">請由即時資料載入</span>
          </div><p className="policy-muted">這是職業間的比較指標，不是失業或被 AI 取代的機率。</p><button className="policy-text-button" onClick={e => flow.navigate(2, 'claim-recruitment-change', e.detail === 0)}>查看判讀原因<Icon name="arrow" /></button></aside><section className="panel policy-comparison" id="comparison" aria-labelledby="comparison-title">
          <div className="panel__header"><div><div className="section-kicker"><Icon name="users" /><span>職業比較</span></div><h2 id="comparison-title" tabIndex={-1} data-flow-id="comparison-title">哪些職業值得優先關注？</h2></div><span className="status">3 個職業</span></div>
          <p className="policy-muted">依結構暴露比較職業，並對照已核對的求才變化。</p>
          <div className="policy-table-head"><span>職業</span><span>結構暴露</span><span>求才年變化</span></div>
          <div role="group" aria-label="選擇職業">
            {snapshot.occupations.map((o, index) => <button className="policy-occupation" aria-pressed={code === o.code} key={o.code} onClick={() => setCode(o.code)}>
              <span className="occupation-label"><span className="occupation-number" aria-label={`序號 ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><span className={`occupation-icon occupation-icon--${o.code}`}><Icon name={occupationIcons[o.code]} /></span><span><b>{o.name}</b><small>職業大類 {o.code}</small></span></span>
              <span className="unscored">—<small>待載入</small></span>
              <span><ChangeText text={percentage(o.previous, o.current)} /></span>
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
          <div className="diagnostic-summary"><span className="diagnostic-icon"><Icon name="info" /></span><span className="policy-diagnostic-label">證據不足</span><p>求才人次比前一年變化 <ChangeText text={percentage(occupation.previous, occupation.current)} />，目前還不能判定是否與 AI 有關。</p></div>
          <ClaimList flow={flow} />
          <h3>判讀重點</h3><ul><li>結構暴露由 A×B 計算，供職業間比較。</li><li>AI 技能職缺占比與其他訊號需分開判讀。</li><li>求才增減還可能受景氣或招募管道影響，不能直接視為 AI 造成的結果。</li></ul>
          <details data-memory="diagnosis-types"><summary>診斷類型說明</summary><p>核定後可區分自動化壓力、AI 增強機會、技能錯配／轉型、非 AI 招募弱化、持續觀察。證據不足不歸入任何風險類型。</p></details>
          <div className="policy-detail-links">
            {(['資料來源', '清洗紀錄', '估算方式'] as Detail[]).map(kind => <button className="policy-text-button" key={kind} onClick={e => openDetail(kind, e.currentTarget)}>
              <Icon name={detailIcons[kind]} />查看{kind}<Icon name="arrow" />
            </button>)}
          </div>
        </aside> }

export function EvidencePage({ occupation, openDetail, flow }: PageProps) { return <div><section className="panel" id="research" aria-labelledby="research-title">
          <EvidenceReview key={occupation.code} occupation={occupation.name} />
          <h3>判讀與證據關聯</h3>
          <LinkedEvidence flow={flow} />
        </section><div className="evidence-actions">{(['資料來源','計算方式','清洗紀錄','估算方式'] as Detail[]).map(kind => <button className="policy-text-button" key={kind} onClick={e=>openDetail(kind,e.currentTarget)}><Icon name={detailIcons[kind]}/>查看{kind}<Icon name="arrow"/></button>)}</div></div> }

export function ReportPage({ occupation, flow }: PageProps) { return <section className="panel policy-report" id="policy" aria-labelledby="policy-title">
          <div className="panel__header"><div><div className="section-kicker"><Icon name="report" /><span>政策建議</span></div><h2 id="policy-title">{occupation.name}的政策方向</h2></div><span className="status">待研究核對</span></div>
          <PolicyMeeting flow={flow} />
          <button className="button" disabled aria-describedby="report-reason"><Icon name="report" />產生完整政策報告</button>
          <p id="report-reason" className="policy-muted">AI 政策報告還沒接上。你可以先用「會議草稿」整理目前已核對的資料與限制。</p>
        </section> }
