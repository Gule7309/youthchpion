import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { PolicyMeeting, EvidenceDetail, LinkedEvidence, type DecisionFlow } from './DecisionPanels'
import { analysisKey, type Analysis } from './decisionModel'
import { useDecisionMeeting } from './useDecisionMeeting'
import { decisionFixture } from './test/decisionFixtures'
import { FolderWorkspace, type WorkspaceHandle } from './FolderWorkspace'
import { createRef } from 'react'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })
const go = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))
function Harness({ analysis }: { analysis: Analysis }) {
  const state = useDecisionMeeting(analysis)
  const flow: DecisionFlow = { analysis, ...state, navigate: vi.fn(), openEvidence: vi.fn() }
  return <PolicyMeeting flow={flow} />
}
describe('決策閱讀與會議草稿互動', () => {
  it('正式畫面串起判讀、證據、原文核對與監測預覽，不發出 API 請求', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    render(<App />)
    const nativeDialog = document.querySelector('dialog')!
    Object.defineProperty(nativeDialog, 'showModal', { value: () => nativeDialog.setAttribute('open', '') })
    Object.defineProperty(nativeDialog, 'close', { value: () => nativeDialog.removeAttribute('open') })
    fireEvent.click(screen.getByRole('button', { name: '查看職業風險' }))
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-risk')
    fireEvent.click(screen.getByRole('button', { name: '查看判讀原因' }))
    expect(document.activeElement).toHaveAttribute('data-flow-id', 'claim-recruitment-change')
    fireEvent.click(screen.getByRole('button', { name: '核對這項判讀' }))
    expect(document.activeElement).toHaveAttribute('data-flow-id', 'evidence-recruitment-change')
    const sourceButton = screen.getByRole('button', { name: '核對來源與限制' })
    fireEvent.click(sourceButton)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/統計期：113、114/)).toBeInTheDocument()
    expect(within(dialog).getByText('整理摘要（非直接引文）')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '關閉詳情' }))
    expect(document.activeElement).toBe(sourceButton)
    fireEvent.click(screen.getByRole('button', { name: '查看相關政策' }))
    expect(document.activeElement).toHaveAttribute('data-flow-id', 'policy-options')
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))
    expect(screen.getByRole('article', { name: '完整會議文件' })).toHaveTextContent('事務支援人員｜監測摘要')
    expect(screen.getByRole('article', { name: '完整會議文件' })).toHaveTextContent('109,342')
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('切換職業關閉舊報告，預覽不出現在新職業下', () => {
    render(<App />); go('報告')
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))
    fireEvent.change(screen.getByRole('combobox', { name: '目前職業' }), { target: { value: '2' } })
    expect(screen.queryByRole('article', { name: '完整會議文件' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))
    expect(screen.getByRole('article', { name: '完整會議文件' })).toHaveTextContent('專業人員｜監測摘要')
  })
  it('零／一／四政策均有正確控制項，不會预選', () => {
    for (const count of [0, 1, 4]) {
      const view = render(<Harness analysis={decisionFixture(count)} />)
      expect(screen.queryAllByRole('checkbox')).toHaveLength(count)
      for (const box of screen.queryAllByRole('checkbox')) expect(box).not.toBeChecked()
      view.unmount()
    }
  })
  it('選取有效政策才納入，未知成本與 KPI 仍顯示待確認', () => {
    const a = decisionFixture(2); a.policies[1].verification = 'pending'
    render(<Harness analysis={a} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes[1]).toBeDisabled(); fireEvent.click(boxes[0])
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))
    const report = screen.getByRole('article', { name: '完整會議文件' })
    expect(report).toHaveTextContent('政策討論草稿')
    expect(report).toHaveTextContent('測試方案 1'); expect(report).not.toHaveTextContent('測試方案 2')
    expect(report).toHaveTextContent('待確認')
  })
  it('版本更新保持舊預覽，明確重建後才更新', () => {
    const a = decisionFixture(1)
    const view = render(<Harness analysis={a} />)
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))
    const newer = structuredClone(a); newer.id = 'TEST-v2'
    view.rerender(<Harness analysis={newer} />)
    expect(screen.getByRole('status')).toHaveTextContent('已有新版分析')
    expect(screen.getByRole('article', { name: '完整會議文件' })).toHaveTextContent(a.id)
    fireEvent.click(screen.getByRole('button', { name: '重新整理草稿' }))
    expect(screen.getByRole('article', { name: '完整會議文件' })).toHaveTextContent('TEST-v2')
  })
  it('同職業同版本恢復選擇，新版本與其他職業不繼承，舊預覽不復活', () => {
    const a = decisionFixture(1)
    const view = render(<Harness analysis={a} />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))
    const b = structuredClone(a); b.occupation.code = '2'; b.occupation.name = '專業人員'; b.policies[0].occupationCode = '2'
    view.rerender(<Harness analysis={b} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.queryByRole('article', { name: '完整會議文件' })).toBeNull()
    view.rerender(<Harness analysis={a} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.queryByRole('article', { name: '完整會議文件' })).toBeNull()
    view.rerender(<Harness analysis={{ ...a, id: 'v2' }} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('列印只是呼叫瀏覽器，關閉預覽會回到原按鈕', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<Harness analysis={decisionFixture(0)} />)
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))
    fireEvent.click(screen.getByRole('button', { name: '列印／另存 PDF' }))
    expect(print).toHaveBeenCalledOnce(); expect(screen.queryByText(/已儲存成功|PDF 已下載/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '關閉預覽' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '預覽會議草稿' }))
  })
  it('缺內容不產生空白預覽，未提供引文不補原文', () => {
    const a = decisionFixture(0); a.claims = []; a.indicators = []
    const view = render(<Harness analysis={a} />)
    expect(screen.getByRole('button', { name: '預覽會議草稿' })).toBeDisabled()
    view.unmount(); render(<EvidenceDetail evidence={a.evidence[1]} />)
    expect(screen.getByText('核對資訊未完整')).toBeInTheDocument()
    expect(screen.queryByRole('blockquote')).toBeNull()
  })
  it('研究關聯缺失不冒充支持，不提供不存在的來源按鈕', () => {
    const a = decisionFixture(0); a.claims[0].relations[0].evidenceId = 'missing'
    render(<LinkedEvidence flow={{ analysis: a, selected: [], draft: null, setDraft: vi.fn(), navigate: vi.fn(), openEvidence: vi.fn(), togglePolicy: vi.fn() }} />)
    expect(screen.getByText('支持 · 待核對')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '核對來源與限制' })).toBeNull()
  })
  it('內容導覽取消舊上下文與快速連點的過時定位', () => {
    const ref = createRef<WorkspaceHandle>()
    const a = decisionFixture()
    render(<FolderWorkspace ref={ref} contextKey={analysisKey(a)} blocked={false} onExternalNavigate={vi.fn()} renderPage={i => <h3 tabIndex={-1} data-flow-id={`target-${i}`}>目標 {i}</h3>} />)
    act(() => { ref.current?.navigate(2, 'target-2', analysisKey(a)); ref.current?.navigate(3, 'target-3', analysisKey(a)) })
    expect(document.activeElement).toHaveAttribute('data-flow-id', 'target-3')
    act(() => ref.current?.navigate(4, 'target-4', 'old-context'))
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-evidence')
  })
  it('新增內容導覽遵守鍵盤與系統減少動態，目標缺漏有提示', () => {
    const ref = createRef<WorkspaceHandle>()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    render(<FolderWorkspace ref={ref} contextKey="current" blocked={false} onExternalNavigate={vi.fn()} renderPage={i => <h3 tabIndex={-1} data-flow-id={`target-${i}`}>目標 {i}</h3>} />)
    act(() => ref.current?.navigate(2, 'target-2', 'current'))
    expect(document.querySelector('.folder-workspace')).toHaveAttribute('data-content-instant', 'true')
    expect(document.querySelector('.is-transitioning')).toBeNull()
    act(() => ref.current?.navigate(3, 'missing', 'current', true))
    expect(screen.getByRole('status')).toHaveTextContent('此內容目前不可用')
    expect(document.activeElement).toBe(screen.getByRole('tabpanel'))
    vi.unstubAllGlobals()
  })
})
