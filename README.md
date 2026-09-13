# Youth Champion / rescueBill

青年 AI 就業轉型決策儀表板。產品以真實資料查詢、可追溯清洗流程、透明政策關注指數、權威證據與 AWS Bedrock 政策選項為核心。

這不是通用資料平台，而是一個聚焦單一議題、可展示真實擷取、清洗、指標、權威證據與政策收斂的黑客松 MVP。

完整規格見 [`docs/DEVELOPMENT_SPEC.md`](docs/DEVELOPMENT_SPEC.md)。

## Live demo

- Dashboard: <https://trzx7426g1.execute-api.us-west-2.amazonaws.com>
- Readiness: <https://trzx7426g1.execute-api.us-west-2.amazonaws.com/ready>
- 精確 18–35 歲資料需使用受授權個體資料；啟用方式見 [`docs/EXACT_18_35_SETUP.md`](docs/EXACT_18_35_SETUP.md)。

若部署環境尚未提供受授權個體資料，API 會明確退回公開年報可直接觀測的 20–24 歲，不會用比例假切 18、19 或 35 歲。

部署在 AWS `us-west-2`，由 API Gateway、Lambda、私有且啟用版本控制的 S3 snapshot bucket、每日 EventBridge 排程與 Amazon Bedrock Nova Lite 組成。Dashboard API 對外提供 Demo；raw/normalized/published snapshots 不公開。

## Local development

Backend:

```powershell
cd backend
uv sync --all-extras
uv run uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

預設前端開發伺服器會將 `/v1` 代理到 `http://127.0.0.1:8000`。

## Quality checks

```powershell
cd backend
uv run ruff check .
uv run pytest -q

cd ../frontend
npm run check
```

## 目前可用流程

- 真實下載主計總處表 47，以 20–24 歲作主要政策分析，25–29 歲只保留為獨立比較組，並將千人統一為人數。
- 真實下載 ILO 2025 生成式 AI 職業暴露資料，彙整至職業大類。
- 真實查詢台灣就業通，修復非標準 XML、去重、排除過期職缺、辨識初階與 AI 技能需求並執行職業 crosswalk。
- 真實下載勞動部 2013–2025 職業求才序列，計算獨立於 AI 職缺占比的招募弱化與門檻敏感度。
- 從數發部官方目錄自動發現最新數位近用調查，解析 PDF 的 20–29 歲工作自動化主觀感受並跨表校驗。
- 真實查詢 104 官方文章、OpenAlex 與 Crossref。
- 每次更新保存 raw/normalized snapshot、SHA-256、HTTP 狀態、筆數、時間與清洗稽核。
- Bedrock 只接收已發布指標與勾選證據，模型未設定或失敗時不顯示假答案。

## 青年 AI 轉型政策關注指數

Dashboard 顯示的 0–100 分不是失業率、失業機率或 AI 取代率，而是相同資料版本內的實驗性政策排序：

```text
A = 該職業青年就業人數 ÷ 該職業全部就業人數
B = ILO 生成式 AI 職務暴露 proxy（0–1）

政策關注指數 = 100 × √(A × B)
```

使用幾何平均可避免單一構面很高時完全支配結果；只有青年集中與 AI 任務暴露同時較高，分數才會明顯上升。這個公式由團隊定義並以 `score_version` 版本化，目前尚未用歷史結果回測校準。

其他訊號不混入分數：

| 訊號 | 定義 | 在決策中的角色 |
| --- | --- | --- |
| P | 該職業占全部青年就業的比率 | 顯示政策可能影響的青年規模 |
| H | 勞動部官方求才年減形成的招募弱化訊號 | 驗證市場是否同步轉弱；不能直接歸因於 AI |
| D | 台灣就業通 AI 相關初階職缺占比 | 區分「需要轉訓」與「已有機會、需要媒合」 |
| 公眾感受 | 數發部版本化調查 | 呈現青年主觀擔憂，不冒充客觀風險 |

原規劃的 C「台灣產業 AI 導入程度」已從計分模型移除。現有產業調查的定義、樣本與產業到職業映射不足以支撐職業層級實值，因此只保留為研究背景。104 文章也只作民間趨勢脈絡，不作量化分數。

政策判讀方式：高關注指數搭配低 D 時優先研究技能培訓與職務轉型；高關注指數搭配高 D 時優先研究技能銜接與就業媒合。所有政策方案仍須通過權威證據 Agent 的來源、原文與台灣適用性閘門。

## 資料來源與清洗

| 來源 | 真實輸入 | 主要處理 | 用途 |
| --- | --- | --- | --- |
| 主計總處表 47 | 官方年度 Excel | 驗證欄位、以 20–24 為主分析、25–29 另列比較、千人轉人數、統一七大職業 | 20–24 歲就業人數與職業集中度 |
| ILO 2025 GenAI Exposure | 官方研究所附 426 筆 CSV | 解析分數與梯度、依 ISCO 職業大類彙整 | 職業 AI 暴露訊號 |
| 台灣就業通 | 勞動部即時公開職缺 XML | 修復非標準 XML、去重、排除過期、辨識初階與 AI 關鍵字、職類 crosswalk | 初階職缺與 AI 機會 |
| 104 職場力 | 官方 WordPress API | 查詢 AI 職缺文章、取得前三篇 metadata、HTML 轉純文字 | 民間產業趨勢脈絡；不進政策關注指數 |
| 勞動部職業求才 | 官方 2013–2025 JSON | 九類先加總分子／分母後合併為七類、年增率、三年變化、10/20/30% 敏感度 | 獨立 H 招募弱化訊號 |
| 數發部數位近用調查 | 最新年度官方頁與 PDF | 自動發現年度、解析表 8-4、以表 8-2 交叉校驗、保留年度序列 | 青年主觀感受；不進政策關注指數 |

Dashboard 的每張來源卡可展開查看本次 HTTP 狀態、SHA-256、實際使用欄位、使用理由、逐步處理規則、限制與可閱讀的官方來源頁。UI 不連到下載檔或機器 API；原始快照只保存在私有 S3 供稽核。`LIVE` 表示本次重新查詢後內容有變動，或是第一次建立快照；`UNCHANGED` 表示本次也有重新下載與處理，但 SHA-256 與上一個成功版本相同，不是 cache 或 fixture。

清洗紀錄必須按來源、按觀測單位分開解讀：主計總處是「選定職業列 → 20–24 歲職業指標」、ILO 是「細職業觀測 → 職業大類」、台灣就業通是「22 個官方職類查詢 → 去重後有效職缺」、104 是「搜尋命中 → 內容解析」、勞動部歷史求才是「年度九類 → 七類可比趨勢」、數發部調查是「官方 PDF → 一筆青年主觀感受與歷年序列」。這些數字皆由當次 run 產生，但不同單位不得相加成一個總 raw/normalized 筆數；104 的 `5 → 3` 是解析選取，不宣稱為清洗。

## Live data

`POST /v1/refresh` 會建立新的 run，實際查詢外部來源。測試 fixture 只用於自動測試，API 回應會明確標記來源 freshness，絕不將 fixture 冒充為即時資料。

第一次開啟畫面時按「開始更新」。前端不含 KPI fixture，因此後端尚未發布時會顯示明確空白狀態。

## Bedrock

只在目前 PowerShell process 設定憑證，不要寫入檔案。至少設定：

```powershell
$Env:AWS_DEFAULT_REGION="us-west-2"
$Env:BEDROCK_MODEL_ID="競賽帳號已開通的 model id"
```

`GET /ready` 會列出模型設定狀態；政策按鈕呼叫 Bedrock Converse API，並限制低於每秒一次。

## Secrets

AWS credentials 只能由執行環境提供，不得提交至 repository。請複製 `.env.example` 的非敏感欄位說明，自行在 shell 設定臨時憑證。

先前貼在對話中的 STS credential 應視為已暴露；正式部署請換發新的短期 credential，repo 內不保存任何 key。

## 前端交接

- API types：`frontend/src/types.ts`
- API client：`frontend/src/api.ts`
- 初版 layout：`frontend/src/App.tsx`
- 所有視覺 tokens 與 responsive rules：`frontend/src/styles.css` 頂端

目前視覺採深色工業風、無圓角模組卡、低彩度藍與等寬數字。隊友可只改 CSS tokens 與元件排版，不需搬動資料計算。

## AWS deployment

`infra/template.yaml` 是完整的 SAM/CloudFormation 定義。部署時先將 Python 3.13 Linux bundle 建到 template 的 `CodeUri`，再執行 `aws cloudformation package` 與 `aws cloudformation deploy`。目前 competition stack 名稱為 `youthchpion-demo`；執行環境透過 CloudFormation 注入 bucket、region 與 Bedrock model id，不需也不得將 AWS key 寫入專案。
