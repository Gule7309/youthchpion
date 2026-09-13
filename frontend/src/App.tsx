import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BackendNotice } from './BackendNotice'
import { ChangeText } from './AnnualChange'
import './uiRefinements.css'
import { refreshDashboard } from './api'
import { pendingIndicators, snapshot } from './verifiedSnapshot'
import { Icon } from './Icon'
import { FolderWorkspace, type WorkspaceHandle } from './FolderWorkspace'
import { IndicatorsPage, RiskPage, DiagnosisPage, EvidencePage, ReportPage, detailIcons, number, percentage, type Detail } from './FolderPages'
import './folderDashboard.css'
import { analysisFromSnapshot, analysisKey } from './decisionModel'
import { EvidenceDetail, type DecisionFlow } from './DecisionPanels'
import { useDecisionMeeting } from './useDecisionMeeting'
import { indicatorHelp, IndicatorExplanation, type IndicatorId } from './indicatorHelp'
import './indicatorHelp.css'

const views = [IndicatorsPage, RiskPage, DiagnosisPage, EvidencePage, ReportPage]
export default function App() {
  const [code, updateCode] = useState<string>('4')
  const [detail, setDetail] = useState<Detail>('資料來源')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const dismissNotice = useCallback(() => setNotice(''), [])
  const [modalOpen, setModalOpen] = useState(false)
  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const [detailInstant, setDetailInstant] = useState(false)
  const indicatorId = !evidenceId && detail.startsWith('指標 ') ? detail.slice(3) as IndicatorId : null
  const workspace = useRef<WorkspaceHandle>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const restoreTrigger = useRef(false)
  const occupation = snapshot.occupations.find(o => o.code === code) ?? snapshot.occupations[0]
  const analysis = useMemo(() => analysisFromSnapshot(code), [code])
  const contextKey = analysisKey(analysis)
  const meeting = useDecisionMeeting(analysis)
  const flow: DecisionFlow = { analysis, ...meeting,
    navigate: (index, target, instant) => workspace.current?.navigate(index, target, contextKey, instant),
    openEvidence(id, button) { trigger.current = button; setEvidenceId(id); setModalOpen(true); dialog.current?.showModal() },
  }
  function setCode(next: string) { if (next === code || !snapshot.occupations.some(o => o.code === next)) return; workspace.current?.saveReading(); meeting.setDraft(null); updateCode(next) }
  function openDetail(kind: Detail, button: HTMLButtonElement, instant = false) {
    setDetailInstant(instant)
    if (dialog.current) dialog.current.scrollTop = 0
    trigger.current = button; setEvidenceId(null); setDetail(kind); setModalOpen(true); dialog.current?.showModal()
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
    setNotice('正在向後端抓取資料，你可以繼續查看目前版本。')
    try {
      await refreshDashboard(() => undefined)
      setNotice('後端已完成抓取，但資料仍是舊版 20–29 歲格式，尚不能用於目前模型。畫面上的數值與日期維持不變。')
    } catch {
      setNotice('重新抓取未完成，請確認後端連線。已保留目前快照，數值與日期未變更。')
    } finally {
      setBusy(false)
    }
  }


  return <div className="folder-app policy-dashboard" data-modal-open={modalOpen}>
    <header className="folder-topbar">
      <div className="folder-brand"><a className="folder-brand-mark" href="#home" aria-label="返回 rescueBill 首頁"><Icon name="logo"/></a><div><strong>rescueBill</strong><h1 tabIndex={-1}>青年 AI 就業風險政策系統</h1></div></div>
      <label className="folder-occupation">目前職業<select aria-label="目前職業" value={code} onChange={e=>setCode(e.target.value)} disabled={modalOpen}>{snapshot.occupations.map(o=><option key={o.code} value={o.code}>{o.name}</option>)}</select></label>
      <div className="folder-period"><span><Icon name="calendar"/>分析期間 <b>2024–2025</b></span><span><Icon name="clock"/>來源核對 <b>{snapshot.checkedAt}</b></span></div>
      <button className="button folder-refresh" disabled={busy || modalOpen} onClick={refresh}><Icon name="refresh" className={busy ? 'is-spinning' : ''}/>{busy ? '抓取中…' : '重新抓取資料'}</button>
    </header>
    <div className="folder-context"><span>全國職業大類 <span aria-hidden="true">/</span> 目標族群 18–35 歲</span><span className="snapshot-badge"><i/>已核對快照 · 非即時更新</span></div>
    <BackendNotice message={notice} busy={busy} onDismiss={dismissNotice} />
    <FolderWorkspace ref={workspace} contextKey={contextKey} blocked={modalOpen} onExternalNavigate={()=>closeDetail(false)} renderPage={index=>{const View=views[index]; return <View occupation={occupation} code={code} setCode={setCode} openDetail={openDetail} flow={flow}/>}}/>
    <dialog id="analysis-detail" ref={dialog} className={`review-dialog${indicatorId ? ' indicator-drawer' : ''}`} data-instant={detailInstant} onClose={() => setModalOpen(false)} aria-labelledby="detail-title" onCancel={e => { e.preventDefault(); closeDetail() }} onClick={e => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect()
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDetail()
        }
      }}>
        <div className="dialog-heading"><span className="section-kicker"><Icon name={detailIcons[detail]} />分析詳情</span><button className="dialog-close" autoFocus onClick={() => closeDetail()} aria-label="關閉詳情"><Icon name="close" /></button></div>
        <h2 id="detail-title">{indicatorId ? `${indicatorId} · ${indicatorHelp[indicatorId].title}` : `${occupation.name} · ${evidenceId ? '證據詳情' : detail}`}</h2>
        {indicatorId && <><p className="policy-muted">目前職業：{occupation.name}</p><IndicatorExplanation id={indicatorId} /></>}
        {evidenceId && <EvidenceDetail evidence={analysis.evidence.find(e => e.id === evidenceId)} />}
        {!evidenceId && detail === '資料來源' && <><p>勞動部「就業服務之求才及求才僱用人數按職業分」。API / JSON；統計期民國 113、114 年，欄位為新登記求才人數（人次）。</p><p>原始值：{number.format(occupation.previous)} → {number.format(occupation.current)} 人次。</p><a href={snapshot.source} target="_blank" rel="noreferrer">資料集說明 ↗</a><p><a href={snapshot.rawUrl} target="_blank" rel="noreferrer">原始 JSON ↗</a></p><p>核對日期 {snapshot.checkedAt}；抓取精確時間、發布時間與 SHA-256：這份快照未保存這些資訊。</p><code>{snapshot.id}</code></>}
        {!evidenceId && detail === '計算方式' && <><p>年度變化 =（2025 − 2024）÷ 2024 = <ChangeText text={percentage(occupation.previous, occupation.current)} />。基期為零或資料缺漏時不計算。</p><p>團隊候選模型：S = (A × B × C)^(1/3)；Risk = 100 × (S + H) / 2。D 獨立呈現。H = clip(−年度變化 / 0.20, 0, 1)，尚待核定。</p><p>公式由團隊核定，不由 AI 自行修改。分數不代表失業機率；缺少必要指標時不補零，也不計分。</p></>}
        {!evidenceId && detail === '清洗紀錄' && <><ol><li>由官方 JSON 選取 113、114 年及對應職業。</li><li>將求才人次轉成數值；確認兩年職業名稱與單位相同。</li><li>計算年度變化率，顯示至小數點後兩位。</li></ol><p>目前列出的是這份快照的整理步驟。每次抓取的處理筆數、檔案雜湊（SHA-256）與職業分類對照紀錄，仍需由後端提供。</p></>}
        {!evidenceId && detail === '估算方式' && <>{pendingIndicators.map(m => <section key={m.id}><h3>{m.id} · {m.name}</h3><p>{m.reason}</p><a href={m.source} target="_blank" rel="noreferrer">來源 ↗</a></section>)}<p>C 會依這個職業在各產業的就業人數加權換算。哪些數值屬於估算或代理指標、涵蓋範圍多大、可信度如何，都還需要核對。</p></>}
      </dialog>
  </div>
}
