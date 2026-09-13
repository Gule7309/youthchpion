# 動畫改善計畫

由 improve-animations 審查；使用者已要求安裝後直接優化，本次不再等待第二次核准。實作階段改用 frontend-design 與 emil-design-eng；不是由審查技能修改程式。

| 順序 | 計畫 | 狀態 |
|---|---|---|
| 1 | 001-folder-continuity.md | DONE |

## 審查結果

| 嚴重度 | 類別 | 原位置 | 發現與修正 |
|---|---|---|---|
| HIGH | Physicality | frontend/src/FolderWorkspace.tsx 的側夾 map；folderDashboard.css 的 .folder-shape | 側夾卸載，主夾另行中心縮放；改持續存在的純裝飾殼，以側槽位置連續移入中央 |
| MEDIUM | Cohesion | folderDashboard.css 的 .folder-tab-marker／aria-selected 字色 | 白字與黑底不同步；改裁切純裝飾副本，原語意 tabs 不變 |
| LOW | Accessibility | folderDashboard.css 的 .folder-peek:hover | Hover 未限滑鼠；改 fine pointer media query |

兩個適合補充的互動：按壓微縮回饋、系統減少動態效果時的原因提示。均已實作，不新增自動播放或裝飾性資料卡動畫。

此為小型前端互動範圍，由主 agent 執行，不需分派。先修外夾連續性，再同步導覽、偏好提示，最後回歸與錄影。
