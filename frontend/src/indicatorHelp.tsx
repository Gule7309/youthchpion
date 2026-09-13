export const indicatorHelp = {
  S: { title: '青年 AI 轉型政策關注指數', meaning: '綜合青年集中程度與 AI 職務暴露，協助比較哪些職業值得優先投入研究與政策討論。', formula: 'S = 100 × √(A × B)', method: '後端將 A 與 B 正規化在 0–1 後取幾何平均，再轉成 0–100 分。H 與 D 保留為獨立判讀訊號，不進入分數。這是團隊定義且有版本紀錄的實驗性指標，不是 AI 自動決定的公式。', interpretation: '數值越高，代表青年集中與 AI 職務暴露的組合訊號較高，政策上應優先深入核對；不代表相同比例的人會失業或被取代。', limitation: '尚未使用歷史結果回測或校準，僅適合相同版本內的職業比較，不能解讀為機率。' },
  A: { title: '青年集中程度', meaning: '看這個職業的就業者中，有多少比例屬於目前資料契約定義的青年範圍。', formula: 'A = 該職業青年就業人數 ÷ 該職業全部就業人數', method: '分子與分母須使用相同職業分類、期間與地區。當受授權個體資料啟用時，後端以足歲年齡精確篩選 18–35 歲；否則維持公開年報可直接觀測的 20–24 歲，實際範圍由當次快照揭露。', interpretation: '比例越高，代表這個職業的變化可能涉及較多青年；A 本身不是 AI 暴露分數。', limitation: '年齡範圍與人口權重必須以同一次資料快照為準。分母是該職業的全部就業者，不是所有職業的青年總數。' },
  B: { title: 'AI 能力暴露', meaning: '描述這個職業的工作任務，有多少可能受到生成式 AI 能力影響。暴露也可能帶來工作輔助，不只代表取代。', formula: 'ILO 職業暴露資料 → 台灣職業分類對照 → 職業大類加權彙整', method: '先核對國際職業分類與台灣分類的對應，再依核定權重彙整。這裡列的是計算流程；分類對照與聚合權重尚未核定，不能給出正式計算式。', interpretation: '暴露較高，表示工作內容與 AI 能力的重疊較多，不等於相同比例的職缺會消失。', limitation: '國際代理指標不能直接當成台灣的失業結果；分類覆蓋率、資料年份與加權方法仍待核對。' },
  H: { title: '招募弱化', meaning: '觀察整體新登記求才人次是否下降，作為招募變弱的訊號。', formula: '年變化 =（本期求才人次 − 前期求才人次）÷ 前期求才人次\nH = clip(−年變化 ÷ 0.20, 0, 1)', method: '這是 v0.4 候選公式。clip 表示把結果限制在 0–1：求才不減時為 0，下降達 20% 時為 1；20% 門檻尚待核定。前期為零或必要值缺漏時不計算。', interpretation: '候選 H 越高表示招募下降越明顯。目前畫面只顯示已核對的年變化，沒有套用 H 分數。', limitation: '這是全年齡、特定就業服務管道的求才人次，不是青年新人職缺，也不能據此判定 AI 造成招募下降。' },
  D: { title: 'AI 人才需求', meaning: '觀察該職業的招募中，有多少職缺要求 AI 技能，輔助討論技能需求與轉型方向。', formula: 'AI 技能職缺占比 = 該職業 AI 技能職缺數 ÷ 該職業有效職缺總數\n以百分比呈現時，再乘以 100%', method: '先確認擷取範圍、去重與有效職缺，再按核定的 AI 技能判定規則計數。相對百分位還需要固定比較母體；成長率需要同口徑的歷史資料。', interpretation: '需求占比高不代表青年一定容易找到工作，還要看經驗與技能要求。D 獨立呈現，不直接乘進 Risk。', limitation: '職缺覆蓋、AI 判定、排名母體及可比歷史尚未完整，因此占比、排名與成長率目前都不提供正式數值。' },
} as const
export type IndicatorId = keyof typeof indicatorHelp
export function IndicatorExplanation({ id }: { id: IndicatorId }) {
  const item = indicatorHelp[id]
  return <div className="indicator-explanation">
    <p className="indicator-method-status">團隊模型 v0.4 候選 · 尚未核定計分</p>
    <section><h3>這個指標代表什麼？</h3><p>{item.meaning}</p></section>
    <section><h3>計算方式</h3><pre>{item.formula}</pre><p>{item.method}</p></section>
    <section><h3>怎麼解讀？</h3><p>{item.interpretation}</p></section>
    <section className="indicator-limitation"><h3>目前限制</h3><p>{item.limitation}</p></section>
    {id === 'S' && <p>此分數是政策關注排序，不是失業率、失業機率或 AI 取代率；政策結論仍須搭配 H、D 與權威證據判讀。</p>}
  </div>
}
