import { useState } from 'react'
import { pendingIndicators, snapshot } from './verifiedSnapshot'
import { Icon } from './Icon'

const candidates = [
  { id: 'mol', title: '勞動部 · 歷年職業求才人次', status: '統計數值已核對', text: '可比較 2024、2025 年的整體求才變化；不能單憑這份資料判定青年失業或 AI 取代。', url: snapshot.source },
  { id: 'ilo', title: 'ILO · 職業 AI 暴露研究', status: '方法參考 · 職業對齊待核對', text: '用來核對 B 指標的國際估計。是否適用於台灣職業，仍需確認分類與研究範圍。', url: pendingIndicators[1].source },
  { id: 'aif', title: 'AIF · 台灣產業 AI 調查', status: '產業背景 · 職業估算待核對', text: 'Ready AI 包含準備與試驗，不能直接當成實際導入率；還需要依就業分布換算到職業。', url: pendingIndicators[2].source },
]

/** Reference layout only: selection is not an AI verification result. */
export function EvidenceReview({ occupation }: { occupation: string }) {
  const [selected, setSelected] = useState<string[]>([])
  return <>
    <div className="panel__header"><div><div className="section-kicker"><Icon name="book" />研究來源核對</div><h2 id="research-title">{occupation}：查找來源、核對判讀</h2></div><button className="button button--ghost" disabled aria-describedby="evidence-service-note">重新檢索來源</button></div>
    <p className="evidence-review-note" id="evidence-service-note">目前可閱讀並勾選下列來源。即時檢索與 AI 原文核對尚未接上；勾選只表示準備核對，不代表研究已支持這個職業的政策。</p>
    <div className="evidence-candidates" role="group" aria-label="選擇待核對來源">{candidates.map(item => <div className="evidence-candidate" key={item.id}>
      <input type="checkbox" id={`candidate-${item.id}`} checked={selected.includes(item.id)} onChange={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} />
      <div><label htmlFor={`candidate-${item.id}`}><b>{item.title}</b></label><small>{item.status}</small><p>{item.text}</p><a href={item.url} target="_blank" rel="noreferrer">查看原始來源<Icon name="external" /></a></div>
    </div>)}</div>
    <div className="evidence-selection"><span>已選 {selected.length} / 3 個來源</span><button className="button" disabled aria-describedby="evidence-service-note">用 AI 核對原文（尚未串接）</button></div>
  </>
}
