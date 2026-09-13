from __future__ import annotations

import json
import os
from typing import Any

from .bedrock import BedrockConverseProvider
from .contracts import ContentType, SourceCandidate, SourceOwnerType
from .factory import build_tool_registry
from .runner import EvidenceHarness, HarnessConfig
from .source_policy import SourcePolicy
from .validation import PublicationGate


class LambdaToolHandlers:
    """Invoke narrow IAM-scoped Lambda tools; tool functions own external API credentials."""

    def __init__(self, client: Any | None = None):
        if client is None:
            import boto3

            client = boto3.client("lambda")
        self._client = client

    def handler(self, function_name: str, decode_candidates: bool = False):
        def invoke(arguments: dict[str, Any]):
            response = self._client.invoke(
                FunctionName=function_name,
                InvocationType="RequestResponse",
                Payload=json.dumps(arguments).encode(),
            )
            raw = json.loads(response["Payload"].read())
            if "errorMessage" in raw:
                raise RuntimeError(f"tool failed: {raw['errorMessage']}")
            return [_candidate(value) for value in raw] if decode_candidates else raw

        return invoke


def build_evidence_harness(model_id: str) -> EvidenceHarness:
    policy = SourcePolicy(
        additional_authoritative_domains=_csv_set("ADDITIONAL_AUTHORITATIVE_DOMAINS"),
        approved_company_domains=_csv_set("APPROVED_COMPANY_DOMAINS"),
    )
    invoker = LambdaToolHandlers()
    functions = {
        "discover_evidence": ("DISCOVER_EVIDENCE_FUNCTION", True),
        "retrieve_candidate": ("RETRIEVE_CANDIDATE_FUNCTION", False),
        "inspect_document": ("INSPECT_DOCUMENT_FUNCTION", False),
        "verify_claim_support": ("VERIFY_CLAIM_SUPPORT_FUNCTION", False),
        "search_policy_knowledge_base": ("SEARCH_POLICY_KB_FUNCTION", False),
    }
    handlers = {
        name: invoker.handler(os.environ[env_name], decode)
        for name, (env_name, decode) in functions.items()
    }
    registry = build_tool_registry(handlers, policy)
    config = HarnessConfig(max_steps=int(os.getenv("EVIDENCE_MAX_STEPS", "20")))
    return EvidenceHarness(
        BedrockConverseProvider(model_id), registry, PublicationGate(policy), config
    )


def _candidate(raw: dict[str, Any]) -> SourceCandidate:
    return SourceCandidate(
        source_id=raw["source_id"],
        title=raw["title"],
        url=raw["url"],
        owner_type=SourceOwnerType(raw["owner_type"]),
        content_type=ContentType(raw["content_type"]),
        publisher=raw["publisher"],
        published_at=raw.get("published_at"),
        authors=tuple(raw.get("authors", ())),
        doi=raw.get("doi"),
        methodology_url=raw.get("methodology_url"),
    )


def _csv_set(name: str) -> frozenset[str]:
    return frozenset(
        value.strip().lower() for value in os.getenv(name, "").split(",") if value.strip()
    )
