# Landing page 交付

- 根網址／`#home` 顯示介紹頁；`#indicators` 進入 Dashboard。既有五頁及舊版 hash 深層連結保留。
- Dashboard 左上品牌圖示提供返回首頁；支援瀏覽器返回／前進。返回首頁會卸載 Dashboard，本次記憶體內的職業、選項與閱讀位置不跨首頁保存。
- 頁面內容：產品定位、官方快照職業預覽、問題與用途、五頁閱讀流程、能力與資料限制、重複進入入口。
- 預覽直接共用 verifiedSnapshot，不另造資料、不請求 API、不加入追蹤或表單。首頁切換的職業只用於預覽，Dashboard 仍以原本預設職業開啟。
- 不展示虛構推薦、機構認證、客戶數或 AI 成效；引用來源不是產品背書。
- 新增 Site／LandingPage／siteRoute；不改指標模型、API 或後端。CSS 使用 landing 命名空間；手機重排，尊重減少動態。
- 參考使用者提供的 https://www.hububble.co/blog/landing-page ，採單一主要 CTA，不沿用不適合政策 Demo 的行銷表單與限時誘因。
- 此次未處理既有 PR 與 main 的合併衝突；未自動提交、推送或部署。

## 驗證

- `npm.cmd run check`：TypeScript、Vite build、6 個測試檔案／58 項測試通過。
- 瀏覽器實測首頁 CTA 進入 `#indicators`、品牌連結返回 `#home`，頁面與標題皆正確。
- 已檢視 1440 × 1000 桌機及 390 × 844 手機截圖；390px 文件寬度為 390px，無水平溢出。
- 截圖：`output/playwright/landing-desktop.png`、`output/playwright/landing-mobile.png`（本機驗收產物）。
- 原生 200% 縮放及實體手機觸控尚未驗證；不取代既有完整 Dashboard／列印驗收。
