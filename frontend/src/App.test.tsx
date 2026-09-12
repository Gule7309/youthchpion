import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not replace a missing dashboard with fixture metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ detail: 'dashboard_not_ready' }),
    }))

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: /先建立第一份.*真實分析快照/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('NO FIXTURE / NO PRETEND DATA')).toBeInTheDocument()
  })
})
