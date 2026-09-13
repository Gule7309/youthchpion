## Purpose

定義權威證據 Agent 的來源限制、受控工具流程、逐項主張證據與 AWS 部署邊界，確保政策輸出只能使用可追溯且通過驗證的研究內容。

## ADDED Requirements

### Requirement: 權威來源限制

系統 SHALL 只接受個別學者的原始研究或官方學術頁、政府、國際組織、研究機構，以及通過核准且公開
方法的企業調查。系統 MUST 在 discovery 與 publication 階段拒絕所有新聞與媒體來源。

#### Scenario: 媒體被錯標為研究機構

- **WHEN** 候選 URL 屬新聞或媒體網域，即使 owner type 被標為研究機構
- **THEN** 系統 SHALL 拒絕該候選，且模型不可取得其內容作為證據

#### Scenario: 企業調查缺少方法

- **WHEN** 企業調查沒有同一核准網域的 methodology URL
- **THEN** 系統 SHALL 拒絕該候選

### Requirement: 受控工具執行

系統 SHALL 依 SEARCHING、RETRIEVING、VERIFYING 階段限制可呼叫工具，並 MUST 在達到最大步數時
停止執行。

#### Scenario: 階段外工具呼叫

- **WHEN** 模型在目前階段呼叫未核准工具
- **THEN** 系統 SHALL 以 protocol error 終止，不執行該工具

### Requirement: Claim-level evidence

系統 SHALL 要求每個證據項目包含來源、原文 excerpt、locator 與 claim mapping。搜尋摘要與 metadata
MUST NOT 單獨支撐 claim。

#### Scenario: 必要主張缺少證據

- **WHEN** request 的 required claim 沒有通過驗證的 evidence item
- **THEN** 系統 SHALL 回傳 PARTIAL，並列出明確 gap

### Requirement: AWS 可部署性

系統 SHALL 提供 Bedrock Converse provider 與 AgentCore Runtime entrypoint，且工具 SHALL 可由具獨立
IAM 權限的 Lambda handler 注入。

#### Scenario: 建立 AWS Runtime

- **WHEN** 部署流程建立權威證據 Agent Runtime
- **THEN** 系統 SHALL 使用 Bedrock Converse provider 與 AgentCore Runtime entrypoint，並允許以個別具最小 IAM 權限的 Lambda handler 注入工具
