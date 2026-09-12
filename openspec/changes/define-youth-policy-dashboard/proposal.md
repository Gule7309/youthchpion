## Why

政策幕僚需要從青年就業訊號追溯研究依據，再評估具體政策方向。新專案以固定 Dashboard 聚焦此任務，先把前端體驗與真實資料驗收條件寫清楚，避免沿用既有開發文件中不同的年齡、公式及操作流程。

## What Changes

- 以 18–35 歲青年為主，顯示 v0.3 的估算方法、覆蓋與限制。
- 建立指標、權威專家與研究、政策選項三區；可切職業查看一致的詳情。
- 模型依附件採 A/B/C 結構性暴露與 H 招募弱化，D 分開作型態訊號；不把風險當失業機率。
- 納入最新模型的 v0.4 候選修正：H 採整體新登記求才人次變化，候選 clip 算法；D 占比與百分位分開，增長須有歷史。首批候選為三個職業大類、2025 Risk 與獨立日期的 D。
- 正式資料由後端按来源週期自動取得、驗證後發布；前端讀自家 API，無使用者手動更新前置，失敗保留最後成功版。
- Demo 需真實數據及已核對來源；缺資料明示，不以示意數字或虛構研究填補。
- 政策以頁面內選項閱讀為本期基礎，引用本地數據與研究，附措施、限制及 KPI。
- 建立前端需求、UX 驗收與待確認決議，以及 Demo 後的後端交接準備稿。

## Capabilities

### New Capabilities

- `youth-policy-dashboard`: 固定 Dashboard、職業切換、五指標解讀、證據追溯、政策閱讀與真實資料驗收。

### Modified Capabilities

無既有 OpenSpec capability。repo 目前有開發文件但無實作；其差異保留於決議表，不視為已核准的 API 變更。

## Impact

此提案先交付需求文件。後續目標為 `frontend/` 的 UI／UX Demo；目前未建立 UI 或呼叫外部資料／AI 服務。真實資料準備是 Demo 驗收前置，完整後端契約於前端體驗驗收後交接。

參考文件：`docs/FRONTEND_REQUIREMENTS_DRAFT.md`、`docs/REQUIREMENTS_DECISIONS.md`、`docs/BACKEND_HANDOFF_DRAFT.md`。保留 `docs/DEVELOPMENT_SPEC.md` 原文；自動更新已獲同意，舊文件的手動更新流程不列前端必備。

## Non-goals

本次不實作產品、資料管線或部署。提案不要求登入、白板、任意資料上傳、自由對話或檔案匯出；候選門檻仍需核定，沒有把模型建議宣告為已驗證算法。
