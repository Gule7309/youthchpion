# 精確 18–35 歲資料啟用

公開人力資源調查年報只提供五歲年齡組，無法精確拆出 18、19 與 35 歲。本專案因此只在取得受授權的個體資料後，才把主要分析人口切換成精確 18–35 歲；否則 API 與 UI 會繼續明示 20–24 歲。

## 合法資料與欄位

- 資料：主計總處人力資源調查個體資料（SRDA AA000047；例如 `lb113.dat`）。
- 使用欄位：`a3` 足歲年齡、`a22` 主要工作職業、`weight` 擴大數。
- 篩選：`18 <= a3 <= 35`，18 與 35 納入，17 與 36 排除。
- 加權：依資料使用說明將年度擴大數總和除以 12，產出年平均人數。
- 輸出：18–24、25–29、30–35 與 18–35 的七職類彙總；個體列不寫入 snapshot、不回傳前端。

資料必須由有權限的團隊成員透過 SRDA 或主計總處申請取得，且依授權條款保存。不可提交 GitHub、放進前端 bundle，或放在公開 S3。

## 本機啟用

```powershell
$Env:DGBAS_MICRODATA_LOCAL_PATH='C:\secure\lb113.dat'
$Env:DGBAS_MICRODATA_PERIOD='2024'
```

未同時設定檔案位置與資料年度時，pipeline 不會註冊個體資料 adapter。

## AWS 啟用

將檔案上傳到 CloudFormation 建立的私有、封鎖公開存取且啟用版本控制的 snapshot bucket，再把部署參數設為：

```text
DgbasMicrodataS3Key=restricted/dgbas/lb113.dat
DgbasMicrodataPeriod=2024
```

Lambda 只讀取此私有 object，公開 API 僅保存並回傳彙總數、資料期、SHA-256 與清洗紀錄。`GET /ready` 的 `checks.exact_18_35_ready` 只有在最新 dashboard 真正使用該來源時才會是 `true`。

## 失敗行為

格式錯誤、資料列過少、缺少職業類別或檔案不可讀時，個體來源標示為 `FAILED`，最新執行不會宣稱精確 18–35。這避免用比例拆分或固定假資料填補缺口。
