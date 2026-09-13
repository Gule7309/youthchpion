# Context

Repository 目前為 greenfield 規格專案。Evidence research 必須與指標運算解耦，且產品規則要求新聞
與媒體在 discovery 到 publication 全程不可使用。

# Goals / Non-Goals

## Goals

- 可替換 LLM provider 與工具實作。
- 可由 Amazon Bedrock AgentCore Runtime 執行。
- 每個 claim 可追溯到原文 excerpt 與 locator。
- 來源規則由 deterministic code 強制執行。

## Non-Goals

- 不實作完整 OpenAlex/Crossref connector Lambda。
- 不實作風險分數、前端或政策生成。
- 不允許 unrestricted browser/search tool。

# Decisions

## 單一 deterministic controller

使用單一狀態機管理模型回合，而非多 agent 自由互聊。這保留 planner/executor 的工作分離，同時提供
明確 phase、tool allowlist、最大步數、低成本與可重播 trace。

## 雙重 policy gate

探索結果先過來源政策，最終 Evidence Package 再逐項驗證。這能處理工具資料錯標，也防止模型在最終
輸出重新帶入未核准來源。

## Lambda tool boundary

AgentCore process 只負責 orchestration；每種工具由獨立 Lambda 實作與授權。未來可改接 AgentCore
Gateway，而不改公開 contract。

# Risks / Trade-offs

- 嚴格 allowlist 會降低 recall；以人工審查新增網域，且 gaps 明示為 `PARTIAL`。
- 公司調查的品質差異大；要求預核網域與同網域 methodology，仍需後續建立抽樣品質評分。
- 目前 Bedrock 最終 JSON codec 是嚴格 boundary，但尚未做 JSON Schema constrained decoding；後續可加。
