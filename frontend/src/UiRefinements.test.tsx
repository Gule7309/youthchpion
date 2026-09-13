import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendNotice } from './BackendNotice'
import { ChangeText } from './AnnualChange'
import { EvidenceReview } from './EvidenceReview'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('資料更新提示', () => {
  it('完成後 8 秒關閉，手動關閉也可操作', () => {
    vi.useFakeTimers(); const dismiss = vi.fn()
    render(<BackendNotice message="更新失敗，保留資料" busy={false} onDismiss={dismiss} />)
    act(() => vi.advanceTimersByTime(7999)); expect(dismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1)); expect(dismiss).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '關閉資料更新提示' })); expect(dismiss).toHaveBeenCalledTimes(2)
  })
  it('抓取中與滑鼠閱讀時不消失，換訊息重算時間，卸載清理', () => {
    vi.useFakeTimers(); const dismiss = vi.fn()
    const { rerender, unmount } = render(<BackendNotice message="抓取中" busy onDismiss={dismiss} />)
    act(() => vi.advanceTimersByTime(10000)); expect(dismiss).not.toHaveBeenCalled()
    rerender(<BackendNotice message="完成" busy={false} onDismiss={dismiss} />)
    fireEvent.mouseEnter(screen.getByLabelText('資料更新提示'))
    act(() => vi.advanceTimersByTime(10000)); expect(dismiss).not.toHaveBeenCalled()
    fireEvent.mouseLeave(screen.getByLabelText('資料更新提示'))
    act(() => vi.advanceTimersByTime(7000))
    rerender(<BackendNotice message="另一次完成" busy={false} onDismiss={dismiss} />)
    act(() => vi.advanceTimersByTime(1000)); expect(dismiss).not.toHaveBeenCalled()
    unmount(); act(() => vi.advanceTimersByTime(10000)); expect(dismiss).not.toHaveBeenCalled()
  })
  it('鍵盤聚焦與背景分頁暫停計時', () => {
    vi.useFakeTimers(); const dismiss = vi.fn()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    render(<BackendNotice message="完成" busy={false} onDismiss={dismiss} />)
    const button = screen.getByRole('button')
    fireEvent.focus(button); act(() => vi.advanceTimersByTime(9000)); expect(dismiss).not.toHaveBeenCalled()
    fireEvent.blur(button)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    act(() => vi.advanceTimersByTime(9000)); expect(dismiss).not.toHaveBeenCalled()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    fireEvent(document, new Event('visibilitychange'))
    act(() => vi.advanceTimersByTime(8000)); expect(dismiss).toHaveBeenCalledTimes(1)
  })
})
it('年變化有粗體、方向色及正負號，不修改數值', () => {
  const { container } = render(<ChangeText text="下降 -14.03%，上升 +2.65%，不變 0.00%" />)
  expect(container.textContent).toBe('下降 -14.03%，上升 +2.65%，不變 0.00%')
  expect(screen.getByText('-14.03%')).toHaveClass('annual-change--down')
  expect(screen.getByText('+2.65%')).toHaveClass('annual-change--up')
  expect(screen.getByText('0.00%').tagName).toBe('STRONG')
})
it('論證來源可勾選，但不冒充完成 AI 核對', () => {
  render(<EvidenceReview occupation="事務支援人員" />)
  expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  fireEvent.click(screen.getByRole('checkbox', { name: /ILO/ }))
  expect(screen.getByText('已選 1 / 3 個來源')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重新檢索來源' })).toBeDisabled()
  expect(screen.getByRole('button', { name: /用 AI 核對原文/ })).toBeDisabled()
})
