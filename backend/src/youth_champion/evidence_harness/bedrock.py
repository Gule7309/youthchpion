from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

from .contracts import AgentAction, FinalAnswer, HarnessState, ToolCall


SYSTEM_PROMPT = """You are the Youth Champion evidence researcher.
Only seek original scholarly work or official pages from scholars, governments,
international organizations, research institutions, and methodology-backed company surveys.
News and media are prohibited, including as discovery leads. Never treat search snippets or
metadata as claim evidence. Return claim-level excerpts with stable source locators.
Use only the supplied tools and finish with an EvidencePackage JSON object.
"""


class BedrockConverseProvider:
    """Thin Amazon Bedrock Converse adapter; orchestration remains in EvidenceHarness."""

    def __init__(self, model_id: str, client: Any | None = None):
        if client is None:
            import boto3

            client = boto3.client("bedrock-runtime")
        self._client = client
        self._model_id = model_id

    def next_action(self, state: HarnessState, tool_schemas: list[dict]) -> AgentAction:
        payload = {
            "request": state.request.__dict__,
            "phase": state.phase,
            "step": state.step,
            "observations": [asdict(observation) for observation in state.observations],
        }
        response = self._client.converse(
            modelId=self._model_id,
            system=[{"text": SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": json.dumps(payload, default=str)}]}],
            toolConfig={"tools": [{"toolSpec": schema} for schema in tool_schemas]},
            inferenceConfig={"temperature": 0, "maxTokens": 4096},
        )
        content = response["output"]["message"]["content"]
        for block in content:
            if "toolUse" in block:
                call = block["toolUse"]
                return ToolCall(call["toolUseId"], call["name"], call.get("input", {}))
            if "text" in block:
                raw = json.loads(block["text"])
                return FinalAnswer(_package_from_json(raw))
        raise ValueError("Bedrock returned neither toolUse nor EvidencePackage JSON")


def _package_from_json(raw: dict[str, Any]):
    # Runtime composition should replace this strict boundary with the project's schema codec.
    from .serialization import evidence_package_from_dict

    return evidence_package_from_dict(raw)
