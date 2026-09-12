import type { Dashboard, EvidenceItem, EvidenceVerification, PolicyResponse } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? ''

const ERROR_MESSAGES: Record<string, string> = {
  policy_contract_invalid_after_retry:
    'Bedrock 已自動校正三次，但本次格式仍不完整。分析資料沒有遺失，請再按一次產生政策選項。',
  insufficient_evidence: '至少需要一筆可解析的權威證據才能產生政策選項。',
  analysis_run_is_not_latest: '資料已更新，請使用最新分析版本重新產生政策選項。',
  evidence_verification_not_found: '找不到本次 Agent 核對紀錄，請重新執行權威證據 Agent。',
  evidence_verification_is_not_latest: '資料版本已更新，請重新執行權威證據 Agent。',
  evidence_not_approved_by_agent: '選取的資料尚未通過原文與來源閘門。',
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    const detail = typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`
    throw new Error(ERROR_MESSAGES[detail] ?? detail)
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

export const verifyEvidence = (payload: {
  analysis_run_id: string
  evidence_ids: string[]
  search_query: string
  question: string
}) =>
  request<EvidenceVerification>('/v1/evidence/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const generatePolicy = (payload: {
  analysis_run_id: string
  occupation_code: string
  policy_goal: string
  evidence_ids: string[]
  verification_id: string
}) =>
  request<PolicyResponse>('/v1/policy-options', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
