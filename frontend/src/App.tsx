import { useLayoutEffect, useRef, useState } from 'react'
import { refreshDashboard } from './api'
import { pendingIndicators, snapshot } from './verifiedSnapshot'
import { Icon } from './Icon'
import { FolderWorkspace, type WorkspaceHandle } from './FolderWorkspace'
import { IndicatorsPage, RiskPage, DiagnosisPage, EvidencePage, ReportPage, detailIcons, number, percentage, type Detail } from './FolderPages'
import './folderDashboard.css'

const views = [IndicatorsPage, RiskPage, DiagnosisPage, EvidencePage, ReportPage]
export default function App() {
  const [code, updateCode] = useState<string>('4')
  const [detail, setDetail] = useState<Detail>('資料來源')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const workspace = useRef<WorkspaceHandle>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const restoreTrigger = useRef(false)
  const occupation = snapshot.occupations.find(o => o.code === code) ?? snapshot.occupations[0]
  function setCode(next: string) { workspace.current?.saveReading(); updateCode(next) }
  function openDetail(kind: Detail, button: HTMLButtonElement) {
    trigger.current = button; setDetail(kind); setModalOpen(true); dialog.current?.showModal()
  }
  function closeDetail(restoreFocus = true) {
    restoreTrigger.current = restoreFocus
    if (dialog.current?.open) dialog.current.close()
    setModalOpen(false)
  }
  useLayoutEffect(() => {
    if (!modalOpen && restoreTrigger.current) {
      restoreTrigger.current = false
      if (trigger.current?.isConnected && !trigger.current.closest('[aria-hidden="true"]')) trigger.current.focus({ preventScroll: true })
      else workspace.current?.focusCurrent()
    }
  }, [modalOpen])
  async function refresh() {
    if (busy) return
    setBusy(true)
    setNotice('正在請求既有資料管線；保留已核對版本。')
    try {
      await refreshDashboard(() => undefined)
      setNotice('既有後端已完成抓取，但回傳仍為舊 20–29 歲契約；新版尚未對齊，保留目前快照，未變更資料日期。')
    } catch {
      setNotice('重新抓取未完成，請確認後端連線。已保留目前快照，數值與日期未變更。')
    } finally {
      setBusy(false)
    }
  }


  return <div className="folder-app policy-dashboard" data-modal-open={modalOpen}>
    <header className="folder-topbar">
      <div className="folder-brand"><span className="folder-brand-mark"><Icon name="logo"/></span><div><strong>YouthLM</strong><h1>青年 AI 就業風險</h1></div></div>
      <label className="folder-occupation">目前職業<select aria-label="目前職業" value={code} onChange={e=>setCode(e.target.value)} disabled={modalOpen}>{snapshot.occupations.map(o=><option key={o.code} value={o.code}>{o.name}</option>)}</select></label>
      <div className="folder-period"><span><Icon name="calendar"/>分析期間 <b>2024–2025</b></span><span><Icon name="clock"/>來源核對 <b>{snapshot.checkedAt}</b></span></div>
      <button className="button folder-refresh" disabled={busy || modalOpen} onClick={refresh}><Icon name="refresh" className={busy ? 'is-spinning' : ''}/>{busy ? '抓取中…' : '重新抓取資料'}</button>
    </header>
    <div className="folder-context"><span>全國職業大類 <span aria-hidden="true">/</span> 目標族群 18–35 歲</span><span className="snapshot-badge"><i/>已核對快照 · 非即時更新</span></div>
    {notice && <p className="policy-notice" role="status"><Icon name="info"/>{notice}</p>}
    <FolderWorkspace ref={workspace} contextKey={`${snapshot.id}:${code}`} blocked={modalOpen} onExternalNavigate={()=>closeDetail(false)} renderPage={index=>{const View=views[index]; return <View occupation={occupation} code={code} setCode={setCode} openDetail={openDetail}/>}}/>
    <dialog ref={dialog} className="review-dialog" onClose={() => setModalOpen(false)} aria-labelledby="detail-title" onCancel={e => { e.preventDefault(); closeDetail() }} onClick={e => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect()
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDetail()
        }
      }}>
        <div className="dialog-heading"><span className="section-kicker"><Icon name={detailIcons[detail]} />分析詳情</span><button className="dialog-close" autoFocus onClick={() => closeDetail()} aria-label="關閉詳情"><Icon name="close" /></button></div>
        <h2 id="detail-title">{occupation.name} · {detail}</h2>
        {detail === '資料來源' && <><p>勞動部「就業服務之求才及求才僱用人數按職業分」。API / JSON；統計期民國 113、114 年，欄位為新登記求才人數（人次）。</p><p>原始值：{number.format(occupation.previous)} → {number.format(occupation.current)} 人次。</p><a href={snapshot.source} target="_blank" rel="noreferrer">資料集說明 ↗</a><p><a href={snapshot.rawUrl} target="_blank" rel="noreferrer">原始 JSON ↗</a></p><p>核對日期 {snapshot.checkedAt}；抓取精確時間、發布時間與 SHA-256：本快照未保存，不能補造。</p><code>{snapshot.id}</code></>}
        {detail === '計算方式' && <><p>年度變化 =（2025 − 2024）÷ 2024 = {percentage(occupation.previous, occupation.current)}。零基期或缺值不計算。</p><p>團隊候選模型：S = (A × B × C)^(1/3)；Risk = 100 × (S + H) / 2。D 獨立呈現。H = clip(−年度變化 / 0.20, 0, 1)，尚待核定。</p><p>AI 不可任意改寫公式。模型不是失業機率；缺少必要指標不補零、不計分。</p></>}
        {detail === '清洗紀錄' && <><ol><li>由官方 JSON 選取 113、114 年及對應職業。</li><li>將求才人次轉成數值；確認兩年職業名稱與單位相同。</li><li>計算年度變化率，顯示至小數點後兩位。</li></ol><p>目前為已核對本地快照，不是即時清洗日誌。新版管線的步驟、筆數、SHA-256 與 crosswalk 稽核仍待 API 提供。</p></>}
        {detail === '估算方式' && <>{pendingIndicators.map(m => <section key={m.id}><h3>{m.id} · {m.name}</h3><p>{m.reason}</p><a href={m.source} target="_blank" rel="noreferrer">來源 ↗</a></section>)}<p>C 需以職業在各產業的就業權重轉換；產業不是主比較維度。估算／proxy、覆蓋率、信心須由核定資料提供，目前均未定。</p></>}
      </dialog>
  </div>
}
