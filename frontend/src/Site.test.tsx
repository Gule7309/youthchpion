import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Site from './Site'

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks() })
function go(hash: string) { act(() => { window.history.pushState(null, '', hash); window.dispatchEvent(new HashChangeEvent('hashchange')) }) }
describe('Landing page and dashboard entry', () => {
  it('opens the homepage without an API call and previews verified occupations', () => {
    window.history.replaceState(null, '', '/')
    const fetch = vi.spyOn(window, 'fetch')
    render(<Site />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bill 畢業了')
    expect(screen.getByText('拯救 Bill，也拯救你的 bill。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'rescueBill 首頁' })).toBeInTheDocument()
    expect(document.title).toBe('rescueBill｜拯救 Bill，也拯救帳單')
    expect(screen.getByText(/英文的 bill 是帳單/)).toBeInTheDocument()
    expect(screen.getByText(/這是題目的故事設定/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getAllByRole('link', { name: '查看職業分析' })).toHaveLength(3)
    fireEvent.change(screen.getByRole('combobox', { name: '選擇職業' }), { target: { value: '2' } })
    expect(screen.getByText('+2.65')).toBeInTheDocument()
    expect(screen.getByText(/全年齡的求才人次，不是青年失業率/)).toBeInTheDocument()
  })
  it('enters the dashboard and returns home without its hash being rewritten', () => {
    window.history.replaceState(null, '', '/')
    render(<Site />)
    go('#indicators')
    expect(screen.getByRole('tab', { name: '指標' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: '返回 rescueBill 首頁' })).toHaveAttribute('href', '#home')
    expect(document.title).toBe('rescueBill｜青年 AI 就業風險政策系統')
    go('#home')
    expect(window.location.hash).toBe('#home')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bill 畢業了')
    go('#home-flow')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
  it('preserves direct dashboard links and browser history navigation', () => {
    window.history.replaceState(null, '', '/#risk')
    render(<Site />)
    expect(screen.getByRole('tab', { name: '排名' })).toHaveAttribute('aria-selected', 'true')
    act(() => { window.history.replaceState(null, '', '/#home'); window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bill 畢業了')
  })
})
