import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EvidenceDetail, PolicyMeeting, type DecisionFlow } from './DecisionPanels'
import { analysisKey, type Analysis } from './decisionModel'
import { FolderWorkspace, type WorkspaceHandle } from './FolderWorkspace'
import { decisionFixture } from './test/decisionFixtures'
import { useDecisionMeeting } from './useDecisionMeeting'

function Harness({ analysis }: { analysis: Analysis }) {
  const meeting = useDecisionMeeting(analysis)
  const flow: DecisionFlow = {
    analysis,
    ...meeting,
    navigate: vi.fn(),
    openEvidence: vi.fn(),
  }
  return <PolicyMeeting flow={flow} />
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('決策閱讀與會議草稿 UI', () => {
  it('零、一、多個真實政策都維持原數量且不預選', () => {
    for (const count of [0, 1, 4]) {
      const view = render(<Harness analysis={decisionFixture(count)} />)
      expect(screen.queryAllByRole('checkbox')).toHaveLength(count)
      for (const checkbox of screen.queryAllByRole('checkbox')) expect(checkbox).not.toBeChecked()
      view.unmount()
    }
  })

  it('只有使用者選取的有效方案會進入可列印會議草稿', () => {
    render(<Harness analysis={decisionFixture(2)} />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))

    const report = screen.getByRole('article', { name: '完整會議文件' })
    expect(report).toHaveTextContent('事務支援人員｜政策討論草稿')
    expect(report).toHaveTextContent('測試政策 1')
    expect(report).not.toHaveTextContent('測試政策 2')
    expect(report).toHaveTextContent('run-live-1')
  })

  it('版本改變保留舊預覽並提示重建，切換職業則關閉預覽', () => {
    const analysis = decisionFixture(1)
    const view = render(<Harness analysis={analysis} />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))

    const newer = structuredClone(analysis)
    newer.id = 'run-live-2'
    view.rerender(<Harness analysis={newer} />)
    expect(screen.getByRole('status')).toHaveTextContent('已有新版分析')

    const otherOccupation = structuredClone(newer)
    otherOccupation.occupation.code = '2'
    otherOccupation.occupation.name = '專業人員'
    view.rerender(<Harness analysis={otherOccupation} />)
    expect(screen.queryByRole('article', { name: '完整會議文件' })).toBeNull()
  })

  it('證據詳情顯示 Agent 原文、定位與限制', () => {
    const evidence = decisionFixture(1).evidence.find((item) => item.id === 'ev-1')
    render(<EvidenceDetail evidence={evidence} />)
    expect(screen.getByText('來源已核對')).toBeInTheDocument()
    expect(screen.getByRole('blockquote')).toHaveTextContent('directly supporting')
    expect(screen.getByText('第 4 節')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /查看原始來源/ })).toHaveAttribute('href', 'https://example.org/research')
  })

  it('內容導覽使用目前 run/職業上下文並把焦點送到目標', () => {
    const ref = createRef<WorkspaceHandle>()
    const analysis = decisionFixture()
    render(<FolderWorkspace
      ref={ref}
      contextKey={analysisKey(analysis)}
      blocked={false}
      onExternalNavigate={vi.fn()}
      renderPage={(index) => <h3 tabIndex={-1} data-flow-id={`target-${index}`}>目標 {index}</h3>}
    />)

    act(() => ref.current?.navigate(3, 'target-3', analysisKey(analysis), true))
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-evidence')
    expect(document.activeElement).toHaveAttribute('data-flow-id', 'target-3')
    act(() => ref.current?.navigate(4, 'target-4', 'old-context'))
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-evidence')
  })

  it('列印只呼叫瀏覽器，不宣稱下載完成', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<Harness analysis={decisionFixture(0)} />)
    fireEvent.click(screen.getByRole('button', { name: '預覽會議草稿' }))
    fireEvent.click(screen.getByRole('button', { name: '列印／另存 PDF' }))
    expect(print).toHaveBeenCalledOnce()
    expect(within(screen.getByRole('article', { name: '完整會議文件' })).queryByText(/已下載|已儲存/)).toBeNull()
  })
})
