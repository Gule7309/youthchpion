# Evidence Agent Harness

Python 3.11 的權威證據研究 Harness。核心套件無第三方相依，可先在本機驗證；AWS 部署時再安裝
`aws` extra。

```bash
cd backend
python -m unittest discover -s tests -v
python -m compileall -q app deployment
```

AWS Runtime 使用 Bedrock Converse 作為模型 provider，並把五個工具映射到各自具最小 IAM 權限的
Lambda。安裝與啟動範例：

```bash
python -m pip install -e . -r agentcore-requirements.txt
export BEDROCK_MODEL_ID='your-bedrock-model-id'
export DISCOVER_EVIDENCE_FUNCTION='yc-discover-evidence'
export RETRIEVE_CANDIDATE_FUNCTION='yc-retrieve-candidate'
export INSPECT_DOCUMENT_FUNCTION='yc-inspect-document'
export VERIFY_CLAIM_SUPPORT_FUNCTION='yc-verify-claim-support'
export SEARCH_POLICY_KB_FUNCTION='yc-search-policy-kb'
python deployment/agentcore_app.py
```

企業調查預設全部拒絕。只有在 `APPROVED_COMPANY_DOMAINS` 明列網域，且候選資料附同網域的
`methodology_url` 時才可通過。`ADDITIONAL_AUTHORITATIVE_DOMAINS` 可加入經人工審查的研究機構
或學術來源。兩者皆為逗號分隔清單。

詳細架構與工具責任見 [`docs/EVIDENCE_AGENT_HARNESS.md`](../docs/EVIDENCE_AGENT_HARNESS.md)。
