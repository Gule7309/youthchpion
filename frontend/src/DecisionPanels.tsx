import { useLayoutEffect, useRef } from 'react'
import { Icon } from './Icon'
import {
  analysisKey,
  buildMeetingDraft,
  claimIssues,
  claimLabels,
  evidenceIssues,
  policyIssues,
  relationIssues,
  relationLabels,
  safeSourceUrl,
  type Analysis,
  type Evidence,
  type MeetingDraft,
  type PolicyOption,
} from './decisionModel'
import './decisionWorkflow.css'

export type DecisionFlow = {
  analysis: Analysis
  navigate: (index: number, target: string, instant?: boolean) => void
  openEvidence: (id: string, button: HTMLButtonElement) => void
  selected: string[]
  togglePolicy: (id: string) => void
  draft: MeetingDraft | null
  setDraft: (draft: MeetingDraft | null) => void
}

const unknown = (value: string | null) => value?.trim() || '待確認'

export function SourceLink({ evidence }: { evidence: Evidence }) {
  const href = safeSourceUrl(evidence.url)
  return href
    ? <a href={href} target="_blank" rel="noreferrer">查看原始來源<Icon name="external" /></a>
    : <span>來源網址不可用</span>
}

export function AnalysisSummary({ flow }: { flow: DecisionFlow }) {
  const claim = flow.analysis.claims.find((item) => !claimIssues(flow.analysis, item).length)
  return <div className="decision-summary">
    <div>
      <strong>目前能看見什麼？</strong>
      <p>{claim?.text ?? '目前沒有可核對的主要判讀，請先查看資料可用狀態。'}</p>
      <small>{flow.analysis.actualPopulation}；不能推論 AI 取代。</small>
    </div>
    <button className="policy-text-button" onClick={(event) => flow.navigate(1, 'comparison-title', event.detail === 0)}>
      查看職業比較<Icon name="arrow" />
    </button>
  </div>
}

export function ClaimList({ flow }: { flow: DecisionFlow }) {
  const analysis = flow.analysis
  return <section className="decision-claims" aria-label="逐項判讀">
    {analysis.claims.map((claim) => <article className="decision-claim" key={claim.id}>
      <span className="decision-tag">{claimLabels[claim.kind]}</span>
      <h3 tabIndex={-1} data-flow-id={`claim-${claim.id}`}>{claim.title}</h3>
      <p>{claim.text}</p>
      <small>指標依據：{claim.indicatorRefs.join('、') || '研究原文'}</small>
      {claimIssues(analysis, claim).length > 0 && <p className="decision-gap">
        證據缺口：{[...new Set(claimIssues(analysis, claim))].join('、')}
      </p>}
      <button className="policy-text-button" onClick={(event) => flow.navigate(3, `evidence-${claim.id}`, event.detail === 0)}>
        核對這項判讀<Icon name="arrow" />
      </button>
    </article>)}
    {!analysis.claims.length && <p className="decision-gap">此職業尚無可核對判讀。</p>}
  </section>
}

export function LinkedEvidence({ flow }: { flow: DecisionFlow }) {
  const analysis = flow.analysis
  return <section className="decision-evidence" aria-label="判讀對應證據">
    {analysis.claims.map((claim) => <article className="decision-claim" key={claim.id}>
      <h3 tabIndex={-1} data-flow-id={`evidence-${claim.id}`}>{claim.title}</h3>
      <p>{claim.text}</p>
      {!claim.relations.length && <p className="decision-gap">尚未建立相符證據，不以一般研究替代。</p>}
      {claim.relations.map((relation, index) => {
        const evidence = analysis.evidence.find((item) => item.id === relation.evidenceId)
        const issues = relationIssues(analysis, relation)
        return <div className="decision-relation" key={`${relation.evidenceId}-${index}`}>
          <div className="decision-relation-heading">
            <span className={`decision-tag role-${relation.role}`}>
              {relationLabels[relation.role]}{issues.length > 0 ? ' · 待核對' : ''}
            </span>
            <h4>{evidence?.title ?? '引用不存在'}</h4>
          </div>
          <p>{relation.reason || '關聯理由待補'}</p>
          {issues.length > 0 && <p className="decision-gap">{issues.join('、')}</p>}
          {evidence && <div className="decision-relation-footer">
            <small>{evidence.scope}</small>
            <button className="policy-text-button" onClick={(event) => flow.openEvidence(evidence.id, event.currentTarget)}>
              核對來源與限制<Icon name="external" />
            </button>
          </div>}
        </div>
      })}
      <button className="policy-text-button" onClick={(event) => flow.navigate(4, 'policy-options', event.detail === 0)}>
        查看相關政策<Icon name="arrow" />
      </button>
    </article>)}
  </section>
}

export function EvidenceDetail({ evidence }: { evidence?: Evidence }) {
  if (!evidence) return <p className="decision-gap">引用已不存在，請關閉詳情並重新選擇。</p>
  const issues = evidenceIssues(evidence)
  return <div className="decision-source">
    <h3>{evidence.title}</h3>
    <span className="decision-tag">{issues.length ? '核對資訊未完整' : '來源已核對'}</span>
    <dl>
      <dt>作者／機構</dt><dd>{unknown(evidence.author)}</dd>
      <dt>發布日期</dt><dd>{unknown(evidence.date)}</dd>
      <dt>來源類型</dt><dd>{evidence.type}</dd>
      <dt>核對日期</dt><dd>{unknown(evidence.checkedAt)}</dd>
      <dt>適用範圍</dt><dd>{evidence.scope}</dd>
      <dt>原文定位</dt><dd>{unknown(evidence.locator)}</dd>
    </dl>
    <h4>整理摘要（非直接引文）</h4>
    <p>{evidence.summary}</p>
    {evidence.quote
      ? <><h4>提供的原文引文</h4><blockquote>{evidence.quote}</blockquote></>
      : <p className="policy-muted">此紀錄未提供直接引文，不補寫原文。</p>}
    <h4>限制</h4>
    <p>{evidence.limitations}</p>
    {issues.length > 0 && <p className="decision-gap">{issues.join('、')}</p>}
    <SourceLink evidence={evidence} />
  </div>
}

function PolicyFields({ option }: { option: PolicyOption }) {
  return <dl className="policy-option-fields">
    <dt>目標對象</dt><dd>{option.target}</dd>
    <dt>要解決的問題</dt><dd>{option.problem}</dd>
    <dt>措施與機制</dt><dd>{option.measures}<p>{option.mechanism}</p></dd>
    <dt>執行條件</dt><dd>{unknown(option.conditions)}</dd>
    <dt>合作方</dt><dd>{unknown(option.partners)}</dd>
    <dt>成本／負擔</dt><dd>{unknown(option.burden)}</dd>
    <dt>預期效益（非保證）</dt><dd>{option.benefit}</dd>
    <dt>KPI 定義</dt><dd>{option.kpi.definition}</dd>
    <dt>KPI 期間／來源／目標</dt><dd>{unknown(option.kpi.period)} ／ {unknown(option.kpi.source)} ／ {unknown(option.kpi.target)}</dd>
    <dt>限制</dt><dd>{option.limitations}</dd>
    <dt>判讀／指標引用</dt><dd>{[...option.claimRefs, ...option.indicatorRefs].join('、')}</dd>
    <dt>研究引用</dt><dd>{option.evidenceRefs.join('、')}</dd>
  </dl>
}

export function PolicyMeeting({ flow }: { flow: DecisionFlow }) {
  const analysis = flow.analysis
  const draft = flow.draft?.analysis.occupation.code === analysis.occupation.code ? flow.draft : null
  const heading = useRef<HTMLHeadingElement>(null)
  const previewButton = useRef<HTMLButtonElement>(null)
  const hadDraft = useRef(false)

  useLayoutEffect(() => {
    if (draft && !hadDraft.current) {
      heading.current?.focus({ preventScroll: true })
      heading.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
    }
    if (!draft && hadDraft.current) previewButton.current?.focus({ preventScroll: true })
    hadDraft.current = Boolean(draft)
  }, [draft])

  const available = buildMeetingDraft(analysis, flow.selected) !== null
  return <div className="decision-meeting">
    <h3 tabIndex={-1} data-flow-id="policy-options">比較政策選項</h3>
    <p className="policy-muted">選擇要帶入會議的方案，不代表核准或最佳推薦；選擇只在本次使用期間保留。</p>
    {!analysis.policies.length && <div className="decision-gap">
      <strong>目前沒有已通過證據閘門的政策選項</strong>
      <p>仍可先預覽監測摘要；完成權威證據核對並呼叫政策 API 後，再比較真實回傳方案。</p>
    </div>}
    <div className="policy-option-grid">{analysis.policies.map((option) => {
      const issues = policyIssues(analysis, option)
      return <article key={option.id} className="policy-option" data-selected={flow.selected.includes(option.id)}>
        <h4>{option.title}</h4>
        <PolicyFields option={option} />
        {issues.length > 0 && <p className="decision-gap" id={`policy-issue-${option.id}`}>{issues.join('、')}</p>}
        <label className="policy-choice">
          <input
            type="checkbox"
            checked={flow.selected.includes(option.id)}
            disabled={issues.length > 0}
            aria-describedby={issues.length ? `policy-issue-${option.id}` : undefined}
            onChange={() => flow.togglePolicy(option.id)}
          />
          納入會議草稿<span className="folder-sr-only">：{option.title}</span>
        </label>
      </article>
    })}</div>
    <div className="meeting-toolbar">
      <div><strong>{flow.selected.length ? `已選取 ${flow.selected.length} 個方案` : '先帶著證據討論'}</strong><p>整理目前可用內容，不再次呼叫 AI 生成服務。</p></div>
      <button className="button" ref={previewButton} disabled={!available} onClick={() => flow.setDraft(buildMeetingDraft(analysis, flow.selected))}>
        <Icon name="report" />{draft ? '重新整理草稿' : '預覽會議草稿'}
      </button>
    </div>
    {!available && <p role="status">尚無可核對內容，無法預覽或列印。</p>}
    {draft && <section className="meeting-preview" aria-label="會議草稿預覽">
      <div className="meeting-preview-controls">
        <h3 ref={heading} tabIndex={-1}>會議草稿預覽</h3>
        <div>
          <button className="policy-text-button" onClick={() => window.print()}>列印／另存 PDF</button>
          <button className="policy-text-button" onClick={() => flow.setDraft(null)}>關閉預覽</button>
        </div>
      </div>
      {analysisKey(draft.analysis) !== analysisKey(analysis) && <p className="decision-gap" role="status">
        已有新版分析；以下保留原快照。請按「重新整理草稿」後再確認內容。
      </p>}
      <p className="policy-muted print-instruction">在瀏覽器列印視窗選擇「另存為 PDF」；關閉列印視窗不代表已儲存。</p>
      <MeetingReport draft={draft} />
    </section>}
  </div>
}

export function MeetingReport({ draft }: { draft: MeetingDraft }) {
  const analysis = draft.analysis
  const numericIndicators = analysis.indicators.filter((indicator) => indicator.value !== null)
  const vacancyIndicators = numericIndicators.filter((indicator) => indicator.unit === '人次')
  const maximumVacancies = Math.max(1, ...vacancyIndicators.map((indicator) => indicator.value ?? 0))
  return <article className="meeting-report" aria-label="完整會議文件">
    <header>
      <span>YouthLM / 政策決策輔助</span>
      <h2>{analysis.occupation.name}｜{draft.kind === 'policy-draft' ? '政策討論草稿' : '監測摘要'}</h2>
      <p>供人工審閱與討論；不是失業預測或已核准政策。</p>
    </header>
    <dl className="report-metadata">
      <dt>分析問題</dt><dd>AI 轉型下，這個職業的青年就業需要關注什麼？</dd>
      <dt>目標／實際範圍</dt><dd>{analysis.targetPopulation} ／ {analysis.actualPopulation}</dd>
      <dt>地區／資料期間</dt><dd>{analysis.geography} ／ {analysis.periods.join('、') || '待確認'}</dd>
      <dt>模型／分析版本</dt><dd>{analysis.modelVersion} ／ {analysis.id}</dd>
      <dt>來源核對／發布日期</dt><dd>{analysis.checkedAt} ／ {unknown(analysis.publishedAt)}</dd>
      <dt>本機整理時間</dt><dd>{new Date(draft.assembledAt).toLocaleString('zh-TW')}（非資料更新時間）</dd>
    </dl>
    <section>
      <h3>可用指標與觀測</h3>
      <p>{analysis.reason}</p>
      <table><thead><tr><th>指標</th><th>期間</th><th>數值</th><th>方法／引用</th></tr></thead><tbody>
        {numericIndicators.map((indicator) => <tr key={indicator.id}>
          <th>{indicator.label}</th><td>{indicator.period}</td>
          <td>{indicator.value?.toLocaleString('zh-TW')} {indicator.unit}</td>
          <td>{indicator.method} / {indicator.sourceRefs.join('、')}</td>
        </tr>)}
      </tbody></table>
      {vacancyIndicators.map((indicator) => <div className="report-chart-row" key={indicator.id}>
        <span>{indicator.id === 'vacancy-previous' ? '前期' : '本期'}</span><div><i style={{ width: `${Math.max(0, (indicator.value ?? 0) / maximumVacancies * 100)}%` }} /></div>
        <b>{indicator.value?.toLocaleString('zh-TW')} {indicator.unit}</b>
      </div>)}
      {vacancyIndicators.length > 0 && <small>同一官方求才序列、同尺度且從零起算；求才人次不是青年新人職缺。</small>}
      {analysis.claims.map((claim) => <div key={claim.id}>
        <h4>{claimLabels[claim.kind]}：{claim.title}</h4><p>{claim.text}</p>
        <small>判讀 {claim.id}；指標 {claim.indicatorRefs.join('、') || '研究原文'}</small>
        {claim.relations.map((relation, index) => <p key={index}>[{relation.evidenceId}] {relationLabels[relation.role]}：{relation.reason}</p>)}
      </div>)}
    </section>
    <section>
      <h3>{analysis.policies.length ? '納入討論的政策' : '政策尚待形成'}</h3>
      {analysis.policies.length
        ? analysis.policies.map((option) => <section key={option.id}><h4>{option.title}</h4><PolicyFields option={option} /></section>)
        : <p>未納入政策選項。本文件只整理監測內容，不代替完整政策提案。</p>}
    </section>
    <section><h3>限制與待補事項</h3><ul>
      {analysis.limitations.map((item, index) => <li key={index}>{item}</li>)}
      {draft.excluded.map((item, index) => <li key={`excluded-${index}`}>未納入：{item}</li>)}
    </ul></section>
    <section><h3>引用來源與適用限制</h3>
      {analysis.evidence.map((evidence) => <section className="report-citation" key={evidence.id}>
        <h4>[{evidence.id}] {evidence.title}</h4>
        <p>{unknown(evidence.author)}；發布 {unknown(evidence.date)}；核對 {unknown(evidence.checkedAt)}</p>
        <p>{evidence.summary}</p><p>定位：{unknown(evidence.locator)}</p>
        <p>範圍：{evidence.scope}</p><p>限制：{evidence.limitations}</p>
        {safeSourceUrl(evidence.url) && <a href={safeSourceUrl(evidence.url)!} target="_blank" rel="noreferrer">{evidence.url}</a>}
      </section>)}
    </section>
  </article>
}
