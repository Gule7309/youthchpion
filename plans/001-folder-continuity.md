# 001 — 讓檔案夾與導覽保持視覺連續

- Status: DONE
- Commit: 1114097（另有未提交五頁 UI）
- Severity: HIGH
- Category: Physicality / Cohesion
- Estimated scope: FolderWorkspace.tsx、folderDashboard.css、測試與紀錄

## Problem

frontend/src/FolderWorkspace.tsx 的 adjacentPages(active).map 只建立當下側邊按鈕；被選中者立即卸載，無法延續為中央外夾。frontend/src/folderDashboard.css 的 .folder-panel 採 translateX(calc(var(--offset)*46%))，.folder-shape 採 scaleX(.08) 且由中心展開；只是兩層分離效果。導覽白字立即切換，底色尚未到位。

## Target

保留五個持續存在、aria-hidden 且 pointer-events:none 的純裝飾外夾，量測中央／側槽位置，以 transform 在位置間連續過渡。文字與外框分層，只有外框縮放。選取色以不可互動、aria-hidden 的文字副本配合 clip-path 同步揭露。

沿用核准 420ms（350–450ms）主過渡，不套用一般小元件小於 300ms 建議。使用技能提供的 drawer 曲線 cubic-bezier(0.32,0.72,0,1)，160ms 按壓回饋；不彈跳。CSS transition 可中斷重定向，不使用每次重播的 keyframes。

## Repo conventions to follow

React/TypeScript、CSS、原生 DOM；沿用 folder-* 類別、Icon.tsx、目前目標＋退場頁、revision 保護與閱讀記憶。配色：紙白 #FFFFFF、畫布 #F7F8FA、夾色 #104B63、導覽 #DEE8ED、文字 #24343D；中文字使用 Microsoft JhengHei / Noto Sans TC sans-serif，16px 內文、26px 標題。內容左齊，只有五頁導覽置中。

頂部五頁 → [側夾] [中央展開夾／穩定文字] [側夾]

## Steps

1. 在 frontend/src/FolderWorkspace.tsx 增加裝飾外夾層，以固定五個 key 保留 DOM；量測側按鈕／中央位置，純背景 transform-origin:0 0，縮放不得套到標題或內容。
2. 量測只在 layout／resize 更新；切換仍可立即再選，resize 取消退場並即時對齊。側按鈕維持獨立語意与不重疊點擊區。
3. frontend/src/folderDashboard.css 移除舊外夾 scale 與側按鈕底色，改由裝飾層呈現；保留舊舞台背景作初始量測前 fallback。
4. 導覽加入純裝飾 active label 副本，透過 clip-path 420ms 同步文字與背景，原生五個 tabs 不變。
5. Hover 僅 fine pointer；reduce 直接定格並提供提示，不覆寫系統偏好。保留 spec 鍵盤與 48px 手勢門檻，不採技能中不符需求的慣性手勢。

## Boundaries

不改公式、資料、API、後端、分頁順序、非循環、wheel 或新增依賴；不安裝全頁捲動套件。以使用者明確要求與 OpenSpec 優先於泛用技能建議。

## Verification

npm run check。瀏覽器記錄切換 100/210/420ms 外夾 transform 與 opacity；慢速檢查內容不被縮扁，側夾連續成為主夾。連點與往返不得重播舊目標；檢查 1440/1024/390/320、resize、reduce 與 modal。保存正常速度錄影。首次載入無飛入動畫。

## Done when

外框、側夾與選取色有可量測中間狀態，只有目前頁可操作；全部回歸測試通過。
