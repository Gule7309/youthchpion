from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from .contracts import AgentPhase, SourceCandidate
from .source_policy import SourcePolicy


class ToolProtocolError(RuntimeError):
    pass


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[[dict[str, Any]], Any]

    def schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": {"json": self.input_schema},
        }


_ALLOWED_BY_PHASE = {
    AgentPhase.SEARCHING: frozenset({"discover_evidence", "search_policy_knowledge_base"}),
    AgentPhase.RETRIEVING: frozenset({"retrieve_candidate", "inspect_document"}),
    AgentPhase.VERIFYING: frozenset({"verify_claim_support", "inspect_document"}),
}

_NEXT_PHASE = {
    "discover_evidence": AgentPhase.RETRIEVING,
    "search_policy_knowledge_base": AgentPhase.RETRIEVING,
    "retrieve_candidate": AgentPhase.RETRIEVING,
    "inspect_document": AgentPhase.VERIFYING,
    "verify_claim_support": AgentPhase.VERIFYING,
}


class ToolRegistry:
    def __init__(self, policy: SourcePolicy):
        self._policy = policy
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ToolProtocolError(f"duplicate tool: {tool.name}")
        self._tools[tool.name] = tool

    def schemas(self) -> list[dict[str, Any]]:
        return [self._tools[name].schema() for name in sorted(self._tools)]

    def execute(self, phase: AgentPhase, name: str, arguments: dict[str, Any]) -> tuple[Any, AgentPhase]:
        if name not in self._tools:
            raise ToolProtocolError(f"unknown tool: {name}")
        if name not in _ALLOWED_BY_PHASE.get(phase, frozenset()):
            raise ToolProtocolError(f"tool {name} is forbidden during phase {phase}")

        result = self._tools[name].handler(arguments)
        if name == "discover_evidence":
            if not isinstance(result, list) or not all(isinstance(item, SourceCandidate) for item in result):
                raise ToolProtocolError("discover_evidence must return list[SourceCandidate]")
            accepted, rejected = self._policy.filter(result)
            result = {"candidates": accepted, "policy_rejections": rejected}
        return result, _NEXT_PHASE[name]


def default_tool_schemas() -> dict[str, dict[str, Any]]:
    text = {"type": "string", "minLength": 1}
    return {
        "discover_evidence": {
            "type": "object",
            "properties": {"query": text, "source_types": {"type": "array", "items": text}},
            "required": ["query"],
            "additionalProperties": False,
        },
        "retrieve_candidate": {
            "type": "object",
            "properties": {"source_id": text},
            "required": ["source_id"],
            "additionalProperties": False,
        },
        "inspect_document": {
            "type": "object",
            "properties": {"source_id": text, "claim_ids": {"type": "array", "items": text}},
            "required": ["source_id", "claim_ids"],
            "additionalProperties": False,
        },
        "verify_claim_support": {
            "type": "object",
            "properties": {"claim_id": text, "source_ids": {"type": "array", "items": text}},
            "required": ["claim_id", "source_ids"],
            "additionalProperties": False,
        },
        "search_policy_knowledge_base": {
            "type": "object",
            "properties": {"query": text},
            "required": ["query"],
            "additionalProperties": False,
        },
    }

