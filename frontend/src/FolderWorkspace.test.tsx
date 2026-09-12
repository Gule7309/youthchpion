import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FolderWorkspace,
  adjacentPages,
  folderPages,
  motionPreferenceKey,
  pageFromHash,
  swipeStep,
} from './FolderWorkspace'

const tab = (name: string) => screen.getByRole('tab', { name })
const panel = () => screen.getByRole('tabpanel')
const renderWorkspace = (blocked = false, contextKey = 'run:4') => render(
  <FolderWorkspace
    contextKey={contextKey}
    blocked={blocked}
    onExternalNavigate={() => undefined}
    renderPage={(index) => <div>頁面內容 {index + 1}</div>}
  />,
)

beforeEach(() => {
  window.localStorage.removeItem(motionPreferenceKey)
  window.history.replaceState(null, '', '/')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('五頁檔案夾工作區', () => {
  it('固定提供五個可存取分頁，預設顯示指標頁', () => {
    renderWorkspace()
    expect(screen.getAllByRole('tab').map((item) => item.textContent)).toEqual(['指標', '風險', '診斷', '論證', '報告'])
    expect(tab('指標')).toHaveAttribute('aria-selected', 'true')
    expect(panel()).toHaveAttribute('id', 'panel-indicators')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  })

  it('用分頁與側邊檔案夾切換內容並更新 hash', () => {
    renderWorkspace()
    fireEvent.click(tab('報告'))
    expect(panel()).toHaveAttribute('id', 'panel-report')
    expect(window.location.hash).toBe('#report')
    fireEvent.click(screen.getByRole('button', { name: '開啟診斷，第 3 頁，共 5 頁' }))
    expect(panel()).toHaveAttribute('id', 'panel-diagnosis')
    expect(tab('診斷')).toHaveFocus()
  })

  it('鍵盤方向鍵移動焦點，Enter 後才切頁', () => {
    renderWorkspace()
    act(() => tab('指標').focus())
    fireEvent.keyDown(tab('指標'), { key: 'End' })
    expect(tab('報告')).toHaveFocus()
    expect(tab('指標')).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(tab('報告'))
    expect(tab('報告')).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: '跳至目前頁內容' }))
    expect(panel()).toHaveFocus()
  })

  it('對話框開啟時可阻擋所有分頁控制', () => {
    renderWorkspace(true)
    for (const item of screen.getAllByRole('tab')) expect(item).toBeDisabled()
    for (const item of screen.getAllByRole('button', { name: /^開啟/ })) expect(item).toBeDisabled()
    expect(screen.getByRole('switch', { name: '動畫效果' })).toBeDisabled()
  })

  it('保留使用者減少動畫偏好', () => {
    renderWorkspace()
    const toggle = screen.getByRole('switch', { name: '動畫效果' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(window.localStorage.getItem(motionPreferenceKey)).toBe('reduced')
    expect(screen.getByText('已減少動畫，切換直接完成。')).toBeInTheDocument()
  })

  it('在各頁與各資料脈絡分開保存閱讀位置', () => {
    const view = renderWorkspace(false, 'run:4')
    const reader = () => panel().querySelector('.folder-reader') as HTMLDivElement
    Object.defineProperty(reader(), 'scrollHeight', { configurable: true, value: 1200 })
    Object.defineProperty(reader(), 'clientHeight', { configurable: true, value: 300 })
    reader().scrollTop = 210
    fireEvent.scroll(reader())
    fireEvent.click(tab('風險'))
    expect(reader().scrollTop).toBe(0)
    fireEvent.click(tab('指標'))
    expect(reader().scrollTop).toBe(210)
    view.rerender(<FolderWorkspace contextKey="run:2" blocked={false} onExternalNavigate={() => undefined} renderPage={(index) => <div>頁面內容 {index + 1}</div>} />)
    expect(reader().scrollTop).toBe(0)
  })

  it.each([
    ['#overview', 0], ['#comparison', 1], ['#diagnosis', 2], ['#research', 3], ['#policy', 4], ['#unknown', 0],
  ])('把既有網址 %s 對應到正確頁次', (hash, expected) => {
    expect(pageFromHash(hash)).toBe(expected)
  })

  it('側邊只顯示相鄰兩層頁面', () => {
    expect(adjacentPages(0).map((item) => item.index)).toEqual([1, 2])
    expect(adjacentPages(2).map((item) => item.index)).toEqual([0, 1, 3, 4])
    expect(adjacentPages(4).map((item) => item.index)).toEqual([2, 3])
    expect(folderPages).toHaveLength(5)
  })

  it('只把明確水平滑動判定為換頁', () => {
    expect(swipeStep(-48, 0)).toBe(1)
    expect(swipeStep(48, 0)).toBe(-1)
    expect(swipeStep(47, 0)).toBe(0)
    expect(swipeStep(-100, 100)).toBe(0)
  })
})
