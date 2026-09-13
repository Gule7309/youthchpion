# rescueBill 架構圖

開啟 [互動架構圖](rescuebill.html)。圖中文字使用繁體中文；Archify 閱讀器的操作介面為英文。

使用 [Archify](https://github.com/tt-a1i/archify) 產出，沒有加入專案執行依賴。這是目前工作樹的架構說明，不是已部署環境的拓撲驗證。

## 程式依據

- `frontend/src/Site.tsx`、`App.tsx`、`FolderWorkspace.tsx`：首頁、五分頁及詳情。
- `frontend/src/verifiedSnapshot.ts`：本地已核對快照。
- `frontend/src/decisionModel.ts`、`DecisionPanels.tsx`：資料判讀、來源限制、會議草稿與瀏覽器列印。
- `frontend/src/api.ts`、`frontend/vite.config.ts`：更新 API 與本機代理。
- `backend/app/main.py`：FastAPI、PipelineService、EvidenceService、BedrockPolicyService 及儲存組件。API 會啟動資料管線；圖為求才資料與前端閱讀的主要關聯，省略觸發回路以免交叉線遮蔽。
- `infra/template.yaml`：SAM 範本的 HTTP API、Lambda、S3、每日排程。圖中獨立放置 AWS 範本，避免暗示已確認線上部署。

綠色主路徑為目前快照閱讀及草稿整理。虛線為後端已有服務入口、但新版 UI 尚未接上的研究與政策服務。舊版資料不會替換新版快照；目前不提供 Risk 分數。

## 重建

在 Archify 的 `archify/` 目錄執行（將路徑替換成實際檔案位置）：

```powershell
node bin/archify.mjs validate architecture C:/Code/youthchpion/docs/architecture/rescuebill.architecture.json --quality showcase --json
node bin/archify.mjs deliver architecture C:/Code/youthchpion/docs/architecture/rescuebill.architecture.json C:/Code/youthchpion/docs/architecture/rescuebill.html --quality showcase --json
node bin/archify.mjs visual-check C:/Code/youthchpion/docs/architecture/rescuebill.html --json
```

只有 deliver 成功後才檢查該輸出，避免驗到舊檔。

## 交付紀錄

```text
diagram_type: architecture
output: C:/Code/youthchpion/docs/architecture/rescuebill.html
specification_sha256: ca307e60994cbd4e73c8157c0858409049b51c12c31429c95312f28170e5f471
artifact_sha256: 497f0745bb20ffb163dd4519b3e1552b9c5c4651851642e05cf0180e851ef354
validation: 9/9 showcase, 0 errors, 0 warnings
browser_evidence: passed
visual_review: passed
correction_rounds: 1
```

`rescuebill.visual-check.json` 是與 HTML 雜湊綁定的瀏覽器驗證紀錄。1440×900、1600×1000、1920×1080、2048×1320 均無水平或垂直溢出。已人工檢視輸出圖片的明／暗主題，節點與連線無重疊，底部說明可見。瀏覽器自動紀錄的 `visualReview: pending` 不代表人工判讀結果；兩者分開保存。
