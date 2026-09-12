// 核對日非發布日；真實官方資料，不是測試 fixture。
export const snapshot = {
  id: 'mol-demand-2025-reviewed-20260912', checkedAt: '2026-09-12',
  source: 'https://data.gov.tw/dataset/146549',
  rawUrl: 'https://apiservice.mol.gov.tw/OdService/download/A17000000J-030281-UAk',
  occupations: [
    { code: '4', name: '事務支援人員', previous: 109342, current: 93997 },
    { code: '2', name: '專業人員', previous: 115186, current: 118244 },
    { code: '5', name: '服務及銷售工作人員', previous: 407329, current: 374693 },
  ],
} as const
export function annualChange(previous: number | null, current: number | null): number | null {
  if (previous == null || current == null || !Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0 || current < 0) return null
  return (current - previous) / previous
}
export const pendingIndicators = [
  { id: 'A', name: '18–35 歲青年就業占比', reason: '已取得五歲年齡分組；尚待人口權重與邊界年齡估算核對。分母為該職業全部就業者。', source: 'https://www.stat.gov.tw/News_Content.aspx?n=4001&s=236078' },
  { id: 'B', name: 'AI 職業暴露程度', reason: 'ILO 國際代理指標；台灣職業分類對照與大類加權方法尚待核對。', source: 'https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure' },
  { id: 'C', name: 'AI 準備與應用成熟度', reason: '代理指標待核定。Ready AI 包含準備及試驗，不能直接稱為實際導入率；尚缺產業映射與加權。', source: 'https://edge.aif.tw/aisurvey-2025-news/' },
  { id: 'D', name: 'AI 人才需求', reason: '占比、相對排名、成長率皆待補齊。需完整資料、去重、AI 職缺判定、比較母體及可比歷史。', source: 'https://data.gov.tw/dataset/44062' },
] as const
