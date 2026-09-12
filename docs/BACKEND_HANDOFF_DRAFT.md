# 前端 Demo 後端交接準備稿

日期：2026-09-12。狀態：待前端體驗及模型口徑確認。此文件記錄未來後端需支援的資料，不是本階段要求後端開始實作的契約。

使用者已確認 18–35 歲、職業切換、真實數據、核對來源及後端自動更新。API 詳約於前端驗收後交接；Demo 前先準備核對過的真實資料。正式 UI 不要求使用者按更新，後端定期取得、計算並發布，前端讀自家 API。

依據 `FRONTEND_REQUIREMENTS_DRAFT.md` 及 v0.3。既有 `DEVELOPMENT_SPEC.md` 的端點、架構和型別尚未在本稿沿用或改寫；先解决 `REQUIREMENTS_DECISIONS.md` 的衝突。

## 1. 分工與交付時點

前端先完成固定 Dashboard 的卡片、詳情、指標呈現、證據列表、政策閱讀與異常狀態。待人工驗收後交付畫面、欄位、成功及失敗 fixture、狀態表、端到端驗收案例。

後端／資料階段再負責資料取得、清洗、歷史快照、職業對照、年齡估算、公式計算、門檻、引用查證、AI 摘要與政策生成及部署。前端顯示後端結果；不自行推定模型門檻或補算缺值。

## 2. 畫面需要的資料概念

以下為待確認語意，欄位名是提案，尚非 API schema。

| 概念 | 最少所需內容 |
|---|---|
| 分析身分 | analysis_id、model_version、資料發布時間、分析地域、目標年齡與實際覆蓋、資料模式 |
| 職業身分 | occupation_code、職業名稱、分類版本與層級、分析年度 |
| 單項指標 | 指標 ID、值或 null、單位、分母／分子、期間、方法、來源 IDs、狀態、限制 |
| A 估算 | estimated_count、occupation_total_employment、share、age_estimation_method、boundary_weights、weight_source、estimate_gap、sensitivity、age_confidence |
| B 暴露 | value／gradient、method、ILO proxy 或在地估計、crosswalk_version、coverage |
| C 導入 | occupation_value、industry_source、employment_weight_version、survey_year、sample、mapping_coverage |
| H 招募 | scope=overall_registered_demand、current_period、baseline_period、兩期新登記求才人次、vacancy_yoy、score、method_version、decline_cap、minimum_volume_rule |
| D 需求 | ai_demand_share、demand_percentile、comparison_set/version、percentile_method、tie_rule、ai_demand_growth 或 null、分子／分母、基期、AI 辨識規則版本 |
| 分數與型態 | S、Risk 或 null、risk_level、顯示精度、risk_type、classification_version、判定理由、不能分類原因 |
| 證據信心 | level、理由、資料缺口；不與 Risk 混算 |
| 來源 | source_id、標題、提供者、URL、資料期間、發表／取得時間、版本、proxy／估算資訊 |
| 研究證據 | evidence_id、作者或機構、來源類型、標題、AI 摘要、發表時間、地域／族群、限制、原文 URL、引用定位、核對狀態 |
| 政策選項 | option_id、analysis_id、對象、問題、措施、作用方式、執行步驟、指標及 evidence 引用、台灣適用條件、KPI、限制、待驗證事項 |

D 成長率不是 0–1，原始占比和百分位需分欄。v0.4 候選 H 改為 clip(-年增率/0.20,0,1)，不再是百分位；原始求才變動仍須保留。模型版本變更不得靜默覆蓋舊定義。H-entry 為未來不同母體的指標。

## 3. 一致性與缺值規則

- 指標、證據關聯與政策結果對應同一分析版本及職業；不能把新分數與舊職業政策拼在一起。
- 時间記錄至少分「資料代表的期間」「來源發表／取得時間」「計算／生成時間」。最新取得不等於資料內容最新。
- 所有值明確區分 null 與 0；缺分母、缺歷史、樣本不足、未映射、來源失敗要有可顯示原因。
- A/B/C/H 缺任一項不計完整 Risk。D 缺值時保留可計分數，但型態規則需顯式處理缺值。
- B 大類聚合／梯度映射、C 產業映射、H 下降飽和參數、D 排名集合與所有信心門檻須版本化。
- H 採同分類 2024／2025 年新登記求才「人次」，不得混用求才僱用欄位；零基期或缺值不計 H。D 只用最新資料可算占比／排名，不能憑單期提供成長。
- D 排名不能只依 UI 三個展示大類；須固定可用且可比的職業集合、同名次處理與最低樣本。混合訊號與資料不足分成不同原因。
- 2025 Risk 與新期 D 的分類屬跨期診斷，需保存兩者 snapshot IDs、資料期間及 classification_as_of；D 變更不重標 Risk 基準年。
- H 並非青年／新人專屬，也非 AI 因果證據；D 不證明就業增加或能抵銷流失，政策 prompt 與結果驗證均需遵循。
- Risk 原型不是因果模型，國際專家內容不進數值公式。
- 政策引用必須是可解析的指標／研究 ID；缺原文內容時不產生假研究結論。
- 數據少或證據不足可回較少政策或空列表，實際允許數量待決議；不能只為固定卡片數補內容。
- 先前成功資料若被保留，需顯示其時間與狀態；Mock 不標示為真實分析或 LIVE。

## 4. UI 必需的狀態

| 情境 | 提供給前端的訊息 | 畫面 |
|---|---|---|
| 初始資料載入 | loading／success／failure | 骨架、內容或可理解錯誤 |
| 單項資料不足 | null、reason、可用構面 | 有值構面可讀，總分視條件 unavailable |
| 引用待核對 | verification_state、缺少內容 | 顯示待核對，不當正式政策依據 |
| 來源過期 | source_period、取得時間、狀態 | 原數據附時間及限制 |
| 政策不足 | options=[]、reason | 補資料方向，不顯示假建議 |
| 模型／服務失敗 | code、retryable、之前結果身分 | 錯誤及先前結果標記；有重試能力才顯示按鈕 |
| 職業切換 | occupation_id、analysis_id | 對象一致，過期回應不覆蓋新選擇 |
| 背景自動更新 | checked_at、published_at、source_period、last_success、source_status | 舊完整版本可讀，新版驗證完成才切換，失敗附可讀原因 |

## 5. 待後端／資料團隊完成

- [ ] 確定 TXT／v0.3 與既有開發規格的優先順序。
- [ ] 核對三個候選職業大類與 2025 A/B/C/H 基準期；D 以實際取得日期分開標示。
- [ ] 取得 A 職業年齡表、同期間單歲人口或合法 microdata，保存權重方法。
- [ ] 核對 B 的可用分數、梯度、ISCO 對照及授權。
- [ ] 取得 C 調查與產業職業就業權重，量測映射覆蓋。
- [ ] 匯入勞動部 dataset 146549；本輪已唯讀確認 117 筆、102–114 年、每年 9 類，仍需檢查數值缺漏、分類與單位，並保存來源版本。
- [ ] 定義職缺去重、需求人數、經驗分類及 AI 技能辨識方法。
- [ ] 核定 H clip 參數、低基數與零基期；固定 D percentile 集合／同名次算法與跨期口徑。
- [ ] 審核 v0.4 候選 S/H/D 門檻與六類型矩陣、資料不足優先處理及品質 gate；門檻標示 heuristic。
- [ ] 確認信心判定、年齡敏感度、Risk 精度與級距邊界。
- [ ] 對首批原始文獻建立作者、年份、URL、相關段落與限制；核對 NotebookLM 來源編號。
- [ ] 建立政策與本地數據／國際研究的連結，以及台灣可行性判讀。
- [ ] 前端 Demo 驗收後共同決定 API 契約與所有 fixture。
- [ ] 後端規劃按來源週期自動檢查 API／檔案、保存歷史、驗證後發布與失敗保留上次結果；核定 cadence、過期上限與快照一致性，不因來源失敗拖垮整頁。
- [ ] 自由搜尋、使用者按鈕觸發生成與匯出屬另案需求；不把自動資料更新等同啟用這些功能。

## 6. 交接用 fixture 情境清單

預計至少覆蓋：完整案例、缺 H、缺 D、分母為零、估算／proxy、研究缺原文、無可用政策、過期資料及來源局部失敗。Demo 必須使用真實案例；異常情境可另以合成測試 fixture 驗證，但不可作展示數據。

Demo 完成後補交具體 fixture 檔與型別；此輪先記錄需求，並未建立或驗證可執行 API。

## 7. 2026-09-12 一頁式 Dashboard 更新

使用者確認比較單位為職業；C 為產業到職業的就業加權 proxy，須附映射、估算與信心，不切换成產業 Dashboard。模型由團隊定義，AI 不得任意修改核定公式。

前端已恢復左指標、中央職業比較、右診斷、下方證據與政策的布局。來源／計算／清洗／估算收在共用詳情面板。

使用者新增可選「重新抓取資料」與完整政策報告入口。開頁仍不得以手動 refresh 為前置。目前 refresh 使用既有 API，舊契約回應不替換新版快照；報告缺模型與證據契約故停用。需提供新版發布版本、最後成功時間、狀態、分職業指標及可解析證據，再啟用新版結果替換與報告生成。來源核對日不是發布時間。

最新實作與限制見 FRONTEND_IMPLEMENTATION_STATUS.md 的「最新調整」段落。尚未部署或宣告完整模型可用。
