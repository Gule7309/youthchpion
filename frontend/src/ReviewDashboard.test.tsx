import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { annualChange, snapshot } from './verifiedSnapshot'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('已核對資料 Dashboard', () => {
  it('開頁無須 API 或更新操作，使用官方快照而非假風險', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    render(<App />)
    expect(screen.getByText('-14.03%')).toBeInTheDocument()
    expect(screen.getByText('109,342 人次')).toBeInTheDocument()
    expect(screen.getByText('資料不足，暫不評分')).toBeInTheDocument()
    expect(screen.queryByText('開始更新')).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('切換職業更新三區與數值，返回時不殘留', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /職業大類 2/ }))
    expect(screen.getByText('+2.65%')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '專業人員的招募訊號' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '專業人員的研究依據' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '專業人員的政策方向' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /職業大類 2/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /職業大類 5/ }))
    expect(screen.getByText('-8.01%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /職業大類 4/ }))
    expect(screen.getByText('-14.03%')).toBeInTheDocument()
  })
  it('所有職業計算與原始值一致；區分零與缺值', () => {
    expect(snapshot.occupations.map(o => Number((annualChange(o.previous, o.current)! * 100).toFixed(2)))).toEqual([-14.03, 2.65, -8.01])
    expect(annualChange(100, 100)).toBe(0)
    expect(annualChange(100, 0)).toBe(-1)
    for (const [a, b] of [[0, 100], [null, 100], [100, null], [-1, 100], [100, -1], [NaN, 10], [10, Infinity]]) expect(annualChange(a, b)).toBeNull()
  })
  it('重新抓取失敗保留真實數字，不改日期，報告不假裝可用', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '重新抓取資料' }))
    expect(await screen.findByText(/重新抓取未完成/)).toBeInTheDocument()
    expect(screen.getByText('109,342 人次')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '產生完整政策報告' })).toBeDisabled()
    expect(screen.getByText('2026-09-12')).toBeInTheDocument()
  })
})
