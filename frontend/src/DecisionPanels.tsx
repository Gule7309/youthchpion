import { useLayoutEffect, useRef } from 'react'
import { Icon } from './Icon'
import { ChangeText } from './AnnualChange'
import { analysisKey, buildMeetingDraft, claimIssues, claimLabels, evidenceIssues, policyIssues, relationIssues, relationLabels, safeSourceUrl, type Analysis, type Evidence, type MeetingDraft, type PolicyOption } from './decisionModel'
import './decisionWorkflow.css'

export type DecisionFlow = {
  analysis: Analysis; navigate: (index: number, target: string, instant?: boolean) => void
  openEvidence: (id: string, button: HTMLButtonElement) => void
  selected: string[]; togglePolicy: (id: string) => void
  draft: MeetingDraft | null; setDraft: (draft: MeetingDraft | null) => void
}
const unknown = (value: string | null) => value?.trim() || '待確認'
export function SourceLink({ evidence }: { evidence: Evidence }) {
  const href = safeSourceUrl(evidence.url)
  return href ? <a href={href} target="_blank" rel="noreferrer">查看原始來源<Icon name="external" /></a> : <span>來源網址不可用</span>
}
export function AnalysisSummary({ flow }: { flow: DecisionFlow }) {
  const claim = flow.analysis.claims.find(c => !claimIssues(flow.analysis, c).length)
  return <div className="decision-summary"><div><strong>目前資料顯示什麼？</strong><p><ChangeText text={claim?.text ?? '目前資料還不足以做出判讀，請先查看資料來源。'} /></p><small>{flow.analysis.actualPopulation}；不能據此判定 AI 取代。</small></div><button className="policy-text-button" onClick={e => flow.navigate(1, 'comparison-title', e.detail === 0)}>查看職業排名<Icon name="arrow" /></button></div>
}
export function ClaimList({ flow }: { flow: DecisionFlow }) {
  const a = flow.analysis
  return <section className="decision-claims" aria-label="逐項判讀">
    {a.claims.map(c => <article className="decision-claim" key={c.id}>
      <span className="decision-tag">{claimLabels[c.kind]}</span><h3 tabIndex={-1} data-flow-id={`claim-${c.id}`}>{c.title}</h3><p><ChangeText text={c.text} /></p>
      <small>指標依據：{c.indicatorRefs.join('、') || '待補'}</small>
      {claimIssues(a, c).length > 0 && <p className="decision-gap">證據缺口：{[...new Set(claimIssues(a, c))].join('、')}</p>}
      <button className="policy-text-button" onClick={e => flow.navigate(3, `evidence-${c.id}`, e.detail === 0)}>核對這項判讀<Icon name="arrow" /></button>
    </article>)}
    {!a.claims.length && <p className="decision-gap">這個職業目前還沒有足夠資料可供判讀。</p>}
  </section>
}
export function LinkedEvidence({ flow }: { flow: DecisionFlow }) {
  const a = flow.analysis
  return <section className="decision-evidence" aria-label="判讀對應證據">
    {a.claims.map(c => <article className="decision-claim" key={c.id}>
      <h3 tabIndex={-1} data-flow-id={`evidence-${c.id}`}>{c.title}</h3><p><ChangeText text={c.text} /></p>
      {!c.relations.length && <p className="decision-gap">還沒有能支持這項判讀的證據，一般背景研究不足以代替。</p>}
      {c.relations.map((r, index) => {
        const e = a.evidence.find(e => e.id === r.evidenceId)
        const issues = relationIssues(a, r)
        return <div className="decision-relation" key={`${r.evidenceId}-${index}`}>
          <div className="decision-relation-heading"><span className={`decision-tag role-${r.role}`}>{relationLabels[r.role]}{issues.length > 0 ? ' · 待核對' : ''}</span>
          <h4>{e?.title ?? '引用不存在'}</h4></div><p>{r.reason || '關聯理由待補'}</p>
          {issues.length > 0 && <p className="decision-gap">{issues.join('、')}</p>}
          {e && <div className="decision-relation-footer"><small>{e.scope}</small><button className="policy-text-button" onClick={event => flow.openEvidence(e.id, event.currentTarget)}>核對來源與限制<Icon name="external" /></button></div>}
        </div>
      })}
      <button className="policy-text-button" onClick={e => flow.navigate(4, 'policy-options', e.detail === 0)}>查看相關政策<Icon name="arrow" /></button>
    </article>)}
  </section>
}
export function EvidenceDetail({ evidence }: { evidence?: Evidence }) {
  if (!evidence) return <p className="decision-gap">引用已不存在，請關閉詳情並重新選擇。</p>
  const issues = evidenceIssues(evidence)
  return <div className="decision-source">
    <h3>{evidence.title}</h3><span className="decision-tag">{issues.length ? '核對資訊待補' : '來源已核對'}</span>
    <dl><dt>作者／機構</dt><dd>{unknown(evidence.author)}</dd><dt>發布日期</dt><dd>{unknown(evidence.date)}</dd><dt>來源類型</dt><dd>{evidence.type}</dd><dt>核對日期</dt><dd>{unknown(evidence.checkedAt)}</dd><dt>適用範圍</dt><dd>{evidence.scope}</dd><dt>原文定位</dt><dd>{unknown(evidence.locator)}</dd></dl>
    <h4>整理摘要（非直接引文）</h4><p>{evidence.summary}</p>
    {evidence.quote ? <><h4>提供的原文引文</h4><blockquote>{evidence.quote}</blockquote></> : <p className="policy-muted">這份紀錄只有摘要，尚未收錄直接引文。</p>}
    <h4>限制</h4><p>{evidence.limitations}</p>{issues.length > 0 && <p className="decision-gap">{issues.join('、')}</p>}<SourceLink evidence={evidence} />
  </div>
}
function PolicyFields({ option: p }: { option: PolicyOption }) {
  return <dl className="policy-option-fields"><dt>目標對象</dt><dd>{p.target}</dd><dt>要解決的問題</dt><dd>{p.problem}</dd><dt>措施與機制</dt><dd>{p.measures}<p>{p.mechanism}</p></dd><dt>執行條件</dt><dd>{unknown(p.conditions)}</dd><dt>合作方</dt><dd>{unknown(p.partners)}</dd><dt>成本／負擔</dt><dd>{unknown(p.burden)}</dd><dt>預期效益（非保證）</dt><dd>{p.benefit}</dd><dt>KPI 定義</dt><dd>{p.kpi.definition}</dd><dt>KPI 期間／來源／目標</dt><dd>{unknown(p.kpi.period)} ／ {unknown(p.kpi.source)} ／ {unknown(p.kpi.target)}</dd><dt>限制</dt><dd>{p.limitations}</dd><dt>判讀／指標引用</dt><dd>{[...p.claimRefs, ...p.indicatorRefs].join('、')}</dd><dt>研究引用</dt><dd>{p.evidenceRefs.join('、')}</dd></dl>
}
export function PolicyMeeting({ flow }: { flow: DecisionFlow }) {
  const a = flow.analysis
  const draft = flow.draft?.analysis.occupation.code === a.occupation.code ? flow.draft : null
  const heading = useRef<HTMLHeadingElement>(null)
  const previewButton = useRef<HTMLButtonElement>(null)
  const hadDraft = useRef(false)
  useLayoutEffect(() => {
    if (draft && !hadDraft.current) { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' }) }
    if (!draft && hadDraft.current) previewButton.current?.focus({ preventScroll: true })
    hadDraft.current = !!draft
  }, [draft])
  const available = buildMeetingDraft(a, flow.selected) !== null
  return <div className="decision-meeting">
    <h3 tabIndex={-1} data-flow-id="policy-options">比較政策選項</h3>
    <p className="policy-muted">勾選想帶到會議討論的方案，之後仍需人工評估。選擇只保留在本次瀏覽，重新整理頁面後會清除。</p>
    {!a.policies.length && <div className="decision-gap"><strong>目前沒有核對完成的政策選項</strong><p>現有招募趨勢不足以支持特定政策。先整理可核對的觀測與限制，等職業政策證據補齊後再比較方案。</p></div>}
    <div className="policy-option-grid">{a.policies.map(p => {
      const issues = policyIssues(a, p)
      return <article key={p.id} className="policy-option" data-selected={flow.selected.includes(p.id)}><h4>{p.title}</h4><PolicyFields option={p} />
        {issues.length > 0 && <p className="decision-gap" id={`policy-issue-${p.id}`}>{issues.join('、')}</p>}
        <label className="policy-choice"><input type="checkbox" checked={flow.selected.includes(p.id)} disabled={issues.length > 0} aria-describedby={issues.length ? `policy-issue-${p.id}` : undefined} onChange={() => flow.togglePolicy(p.id)} />納入會議草稿<span className="folder-sr-only">：{p.title}</span></label>
      </article>
    })}</div>
    <div className="meeting-toolbar"><div><strong>{flow.selected.length ? `已選取 ${flow.selected.length} 個方案` : '整理會議草稿'}</strong><p>將目前資料整理成草稿，這一步不使用 AI。</p></div><button className="button" ref={previewButton} disabled={!available} onClick={() => flow.setDraft(buildMeetingDraft(a, flow.selected))}><Icon name="report" />{draft ? '重新整理草稿' : '預覽會議草稿'}</button></div>
    {!available && <p role="status">尚無可核對內容，無法預覽或列印。</p>}
    {draft && <section className="meeting-preview" aria-label="會議草稿預覽">
      <div className="meeting-preview-controls"><h3 ref={heading} tabIndex={-1}>會議草稿預覽</h3><div><button className="policy-text-button" onClick={() => window.print()}>列印／另存 PDF</button><button className="policy-text-button" onClick={() => flow.setDraft(null)}>關閉預覽</button></div></div>
      {analysisKey(draft.analysis) !== analysisKey(a) && <p className="decision-gap" role="status">已有新版分析；以下保留原快照。請按「重新整理草稿」後再確認內容。</p>}
      <p className="policy-muted print-instruction">在瀏覽器列印視窗選擇「另存為 PDF」。關閉列印視窗不代表已儲存。</p>
      <MeetingReport draft={draft} />
    </section>}
  </div>
}
export function MeetingReport({ draft }: { draft: MeetingDraft }) {
  const a = draft.analysis
  const maximum = Math.max(1, ...a.indicators.filter(i => i.unit === '人次').map(i => i.value ?? 0))
  return <article className="meeting-report" aria-label="完整會議文件">
    <header><span>rescueBill / 政策決策輔助</span><h2>{a.occupation.name}｜{draft.kind === 'policy-draft' ? '政策討論草稿' : '監測摘要'}</h2><p>供人工審閱與討論；不是失業預測或已核准政策。</p></header>
    <dl className="report-metadata"><dt>分析問題</dt><dd>AI 衝擊下，這個職業的青年就業需要關注什麼？</dd><dt>目標／實際範圍</dt><dd>{a.targetPopulation} ／ {a.actualPopulation}</dd><dt>地區／資料期間</dt><dd>{a.geography} ／ {a.periods.join('、')}</dd><dt>模型／分析版本</dt><dd>{a.modelVersion} ／ {a.id}</dd><dt>來源核對／發布日期</dt><dd>{a.checkedAt} ／ {unknown(a.publishedAt)}</dd><dt>本機整理時間</dt><dd>{new Date(draft.assembledAt).toLocaleString('zh-TW')}（非資料更新時間）</dd></dl>
    <section><h3>可用指標與觀測</h3><p>{a.reason}</p><table><thead><tr><th>指標</th><th>期間</th><th>數值</th><th>方法／引用</th></tr></thead><tbody>{a.indicators.map(i => <tr key={i.id}><th>{i.label}</th><td>{i.period}</td><td>{i.value?.toLocaleString('zh-TW')} {i.unit}</td><td>{i.method} / {i.sourceRefs.join('、')}</td></tr>)}</tbody></table>
      {a.indicators.filter(i => i.unit === '人次').map(i => <div className="report-chart-row" key={i.id}><span>{i.period}</span><div><i style={{ width: `${(i.value ?? 0) / maximum * 100}%` }} /></div><b>{i.value?.toLocaleString('zh-TW')} 人次</b></div>)}
      {a.indicators.some(i => i.unit === '人次') && <small>同尺度、從零起算；全年齡求才，不是青年新人職缺。</small>}
      {a.claims.map(c => <div key={c.id}><h4>{claimLabels[c.kind]}：{c.title}</h4><p>{c.text}</p><small>判讀 {c.id}；指標 {c.indicatorRefs.join('、')}</small>{c.relations.map((r, i) => <p key={i}>[{r.evidenceId}] {relationLabels[r.role]}：{r.reason}</p>)}</div>)}
    </section>
    <section><h3>{a.policies.length ? '納入討論的政策' : '政策尚待形成'}</h3>{a.policies.length ? a.policies.map(p => <section key={p.id}><h4>{p.title}</h4><PolicyFields option={p} /></section>) : <p>未納入政策選項。本文件僅整理監測內容，不代替完整政策提案。</p>}</section>
    <section><h3>限制與待補事項</h3><ul>{a.limitations.map((l, i) => <li key={i}>{l}</li>)}{draft.excluded.map((l, i) => <li key={`excluded-${i}`}>未納入：{l}</li>)}</ul></section>
    <section><h3>引用來源與適用限制</h3>{a.evidence.map(e => <section className="report-citation" key={e.id}><h4>[{e.id}] {e.title}</h4><p>{unknown(e.author)}；發布 {unknown(e.date)}；核對 {unknown(e.checkedAt)}</p><p>{e.summary}</p><p>定位：{unknown(e.locator)}</p><p>範圍：{e.scope}</p><p>限制：{e.limitations}</p>{safeSourceUrl(e.url) && <a href={safeSourceUrl(e.url)!} target="_blank" rel="noreferrer">{e.url}</a>}</section>)}</section>
  </article>
}
