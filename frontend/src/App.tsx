import { useRef, useState } from 'react'
import { refreshDashboard } from './api'
import { annualChange, pendingIndicators, snapshot } from './verifiedSnapshot'
import './policyDashboard.css'

const number = new Intl.NumberFormat('zh-TW')
const percentage = (a:number,b:number) => { const v=annualChange(a,b);return v==null?'—':`${v>0?'+':''}${(v*100).toFixed(2)}%` }
type Detail = '資料來源'|'計算方式'|'清洗紀錄'|'估算方式'
export default function App(){
  const [code,setCode]=useState<string>('4')
  const [detail,setDetail]=useState<Detail>('資料來源')
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const dialog=useRef<HTMLDialogElement>(null)
  const trigger=useRef<HTMLButtonElement|null>(null)
  const occupation=snapshot.occupations.find(o=>o.code===code)??snapshot.occupations[0]
  function openDetail(kind:Detail,button:HTMLButtonElement){trigger.current=button;setDetail(kind);dialog.current?.showModal()}
  function closeDetail(){dialog.current?.close();trigger.current?.focus()}
  async function refresh(){
    if(busy)return
    setBusy(true);setNotice('正在請求既有資料管線；保留已核對版本。')
    try{await refreshDashboard(()=>undefined);setNotice('既有後端已完成抓取，但回傳仍為舊 20–29 歲契約；新版尚未對齊，保留目前快照，未變更資料日期。')}
    catch{setNotice('重新抓取未完成，請確認後端連線。已保留目前快照，數值與日期未變更。')}
    finally{setBusy(false)}
  }
  return <main className="policy-dashboard" id="overview">
    <header className="topbar"><a href="#overview" className="brand"><span className="brand__mark">Y</span>青年 AI 就業風險</a><div className="policy-meta"><span>分析期間 <b>2024–2025</b></span><span>來源核對 <b>{snapshot.checkedAt}</b></span><span>最後更新 <b>未接入新版發布時間</b></span></div><button className="button" disabled={busy} onClick={refresh}>{busy?'抓取中…':'重新抓取資料'}</button></header>
    {notice&&<p className="policy-notice" role="status">{notice}</p>}
    <div className="policy-workspace">
      <aside className="panel policy-indicators" aria-label="目前職業核心指標"><span className="eyebrow">01 / 核心指標</span><h2>{occupation.name}</h2><div className="policy-risk"><span>AI 就業風險 Risk</span><strong>—<small> / 100</small></strong><span>資料不足，暫不評分</span></div>
        {[['S','結構性 AI 暴露'],['A','青年集中程度'],['B','AI 能力暴露'],['C','台灣 AI 導入訊號'],['H','招募弱化'],['D','AI 人才需求']].map(([id,label])=><div className="policy-metric" key={id}><span><b>{id}</b> {label}</span><strong>—</strong><div className="policy-meter"/><small>{id==='H'?'歷史已取得 · 方法待核定':'待核對'}</small></div>)}
        <button className="policy-text-button" onClick={e=>openDetail('計算方式',e.currentTarget)}>查看計算方式 ↗</button>
      </aside>
      <section className="panel policy-comparison" aria-labelledby="comparison-title"><div className="panel__header"><div><span className="eyebrow">02 / 職業比較</span><h2 id="comparison-title">哪些職業值得優先關注？</h2></div><span className="status">3 個職業</span></div><p className="policy-muted">Risk 尚未核定，暫不排名；先比較已核對的招募訊號。</p><div className="policy-table-head"><span>職業</span><span>Risk</span><span>求才年變化</span></div>
        <div role="group" aria-label="選擇職業">{snapshot.occupations.map(o=><button className="policy-occupation" aria-pressed={code===o.code} key={o.code} onClick={()=>setCode(o.code)}><span><small>職業大類 {o.code}</small><b>{o.name}</b></span><span>—<small>待核對</small></span><strong>{percentage(o.previous,o.current)}</strong></button>)}</div>
        <div className="policy-trend"><h3>{occupation.name}的招募訊號</h3><p>整體新登記求才人次 · 2024 → 2025</p>{[{year:2024,value:occupation.previous},{year:2025,value:occupation.current}].map(row=><div className="policy-bar" key={row.year}><span>{row.year}</span><div><i style={{width:`${row.value/407329*100}%`}}/></div><b>{number.format(row.value)} 人次</b></div>)}<small>同一尺度、從零起算。全年齡求才，不是青年新人招募或 AI 因果效果。</small></div>
      </section>
      <aside className="panel policy-diagnosis"><span className="eyebrow">03 / 職業診斷</span><h2>{occupation.name}</h2><span className="policy-diagnostic-label">證據不足</span><p>目前可觀察到招募年變化 {percentage(occupation.previous,occupation.current)}，但尚不足以歸因於 AI。</p><h3>判讀重點</h3><ul><li>A／B／C 尚待核對，無完整 S 與 Risk。</li><li>D 需求占比及排名尚未建立。</li><li>求才上升不代表低風險；下降不代表被取代。</li></ul><details><summary>診斷類型說明</summary><p>核定後可區分自動化壓力、AI 增強機會、技能錯配／轉型、非 AI 招募弱化、持續觀察。證據不足不歸入任何風險類型。</p></details><div className="policy-detail-links">{(['資料來源','清洗紀錄','估算方式'] as Detail[]).map(kind=><button className="policy-text-button" key={kind} onClick={e=>openDetail(kind,e.currentTarget)}>查看{kind} ↗</button>)}</div></aside>
    </div>
    <div className="policy-bottom">
      <section className="panel" aria-labelledby="research-title"><span className="eyebrow">04 / 研究證據</span><h2 id="research-title">{occupation.name}的研究依據</h2><div className="policy-evidence"><b>ILO · 職業 AI 暴露研究</b><span>模型方法來源</span><p>用於核對 B 的國際代理指標；不直接作為台灣該職業失業或政策成效的證明。</p><a href={pendingIndicators[1].source} target="_blank" rel="noreferrer">查看原文 ↗</a></div><div className="policy-evidence"><b>AIF · 台灣產業 AI 調查</b><span>產業背景來源</span><p>Ready AI 包含準備與試驗；須經產業 → 職業加權映射，不能直接當成職業實際導入率。</p><a href={pendingIndicators[2].source} target="_blank" rel="noreferrer">查看原文 ↗</a></div><small>以上為方法／背景來源。職業專屬的支持、反對證據與政策研究原文定位仍待補齊，不冒充專家背書。</small></section>
      <section className="panel" aria-labelledby="policy-title"><div className="panel__header"><div><span className="eyebrow">05 / 政策建議</span><h2 id="policy-title">{occupation.name}的政策方向</h2></div><span className="status">待研究核對</span></div><h3>先確認問題，再選擇介入方式</h3><p>現有招募趨勢不足以支持特定政策。需確認青年／初階職缺是否有相同變化，以及景氣、產業結構等其他解釋。</p><div className="policy-report-outline"><span>完整政策報告將包含</span><ol><li>職業風險與指標診斷</li><li>國際研究與適用限制</li><li>政策選項、執行措施與 KPI</li></ol></div><button className="button" disabled aria-describedby="report-reason">產生完整政策報告</button><p id="report-reason" className="policy-muted">新版模型、政策證據及報告 API 尚未就緒，暫不產生報告。</p></section>
    </div>
    <dialog ref={dialog} className="review-dialog" aria-labelledby="detail-title" onCancel={e=>{e.preventDefault();closeDetail()}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDetail()}}}><button className="button" autoFocus onClick={closeDetail}>關閉詳情</button><h2 id="detail-title">{occupation.name} · {detail}</h2>
      {detail==='資料來源'&&<><p>勞動部「就業服務之求才及求才僱用人數按職業分」。API / JSON；統計期民國 113、114 年，欄位為新登記求才人數（人次）。</p><p>原始值：{number.format(occupation.previous)} → {number.format(occupation.current)} 人次。</p><a href={snapshot.source} target="_blank" rel="noreferrer">資料集說明 ↗</a><p><a href={snapshot.rawUrl} target="_blank" rel="noreferrer">原始 JSON ↗</a></p><p>核對日期 {snapshot.checkedAt}；抓取精確時間、發布時間與 SHA-256：本快照未保存，不能補造。</p><code>{snapshot.id}</code></>}
      {detail==='計算方式'&&<><p>年度變化 =（2025 − 2024）÷ 2024 = {percentage(occupation.previous,occupation.current)}。零基期或缺值不計算。</p><p>團隊候選模型：S = (A × B × C)^(1/3)；Risk = 100 × (S + H) / 2。D 獨立呈現。H = clip(−年度變化 / 0.20, 0, 1)，尚待核定。</p><p>AI 不可任意改寫公式。模型不是失業機率；缺少必要指標不補零、不計分。</p></>}
      {detail==='清洗紀錄'&&<><ol><li>由官方 JSON 選取 113、114 年及對應職業。</li><li>將求才人次轉成數值；確認兩年職業名稱與單位相同。</li><li>計算年度變化率，顯示至小數點後兩位。</li></ol><p>目前為已核對本地快照，不是即時清洗日誌。新版管線的步驟、筆數、SHA-256 與 crosswalk 稽核仍待 API 提供。</p></>}
      {detail==='估算方式'&&<>{pendingIndicators.map(m=><section key={m.id}><h3>{m.id} · {m.name}</h3><p>{m.reason}</p><a href={m.source} target="_blank" rel="noreferrer">來源 ↗</a></section>)}<p>C 需以職業在各產業的就業權重轉換；產業不是主比較維度。估算／proxy、覆蓋率、信心須由核定資料提供，目前均未定。</p></>}
    </dialog>
    <footer>青年就業風險 → 指標原因 → 研究證據 → 政策建議 · 來源與方法可追溯</footer>
  </main>
}
