// Synthetic policy content is imported by tests only. Never use as API fallback.
import { analysisFromSnapshot, type Analysis, type PolicyOption } from '../decisionModel'
export function decisionFixture(count = 2): Analysis {
  const a = structuredClone(analysisFromSnapshot('4'))
  a.id = 'TEST-ONLY-SYNTHETIC-v1'
  a.policies = Array.from({ length: count }, (_, i): PolicyOption => ({
    id: `test-option-${i}`, occupationCode: '4', title: `測試方案 ${i + 1}`, target: '測試對象', problem: '測試問題', measures: '測試措施', mechanism: '測試機制',
    conditions: null, partners: null, burden: null, benefit: '測試預期效益', limitations: '僅驗證互動，不可公開當成政策。',
    kpi: { definition: '測試定義', period: null, source: null, target: null },
    claimRefs: ['recruitment-change'], indicatorRefs: ['demand-2024', 'demand-2025'], evidenceRefs: ['mol-demand-4'], verification: 'verified',
  }))
  return a
}
