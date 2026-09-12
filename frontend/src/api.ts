import type { Dashboard, EvidenceItem, PolicyResponse } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(body.detail ?? `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const getDashboard = () => request<Dashboard>('/v1/dashboard')

export async function refreshDashboard(onStatus: (value: string) => void): Promise<Dashboard> {
  const run = await request<{ run_id: string; poll_url: string }>('/v1/refresh', {
    method: 'POST',
    body: JSON.stringify({ force: true }),
  })
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = await request<{ status: string; error?: string }>(run.poll_url)
    onStatus(status.status)
    if (['SUCCEEDED', 'PARTIAL'].includes(status.status)) return getDashboard()
    if (status.status === 'FAILED') throw new Error(status.error ?? '資料更新失敗')
    await new Promise((resolve) => window.setTimeout(resolve, 750))
  }
  throw new Error('資料更新逾時')
}

export const searchEvidence = (query: string) =>
  request<EvidenceItem[]>('/v1/evidence/search', {
    method: 'POST',
    body: JSON.stringify({ query, limit: 8, force_live: true }),
  })

export const generatePolicy = (payload: {
  analysis_run_id: string
  occupation_code: string
  policy_goal: string
  evidence_ids: string[]
}) =>
  request<PolicyResponse>('/v1/policy-options', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
