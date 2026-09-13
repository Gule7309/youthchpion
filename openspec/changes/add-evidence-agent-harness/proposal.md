# Why

Youth Champion 需要一個可部署至 AWS、可稽核且不依賴新聞內容的權威證據研究層。若讓模型自行選擇
網頁與決定可信度，容易把搜尋摘要、媒體轉述或缺乏方法揭露的調查誤當作證據。

# What Changes

- 新增具階段、工具白名單與最大步數的 Evidence Agent Harness。
- 新增模型外的來源政策與出版閘門，明確禁止新聞／媒體。
- 新增 Bedrock Converse provider 與 AgentCore Runtime 入口。
- 新增 claim-level Evidence Package contract、單元測試與架構文件。
- 工具以 Lambda handler 注入，為 OpenAlex、Crossref、官方文件與 Bedrock KB 留下清楚邊界。

# Capabilities

## New Capabilities

- `evidence-agent-harness`: 受控地探索、擷取、驗證並封裝權威證據。

# Impact

新增 `backend/` Python 套件、測試、AWS runtime 入口與架構文件。此變更不建立前端、不計算 AI
就業風險指標，也不產生最終政策建議。
