from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .source_policy import SourcePolicy
from .tools import Tool, ToolRegistry, default_tool_schemas


def build_tool_registry(handlers: dict[str, Callable[[dict[str, Any]], Any]], policy: SourcePolicy) -> ToolRegistry:
    schemas = default_tool_schemas()
    missing = schemas.keys() - handlers.keys()
    if missing:
        raise ValueError(f"missing tool handlers: {sorted(missing)}")
    registry = ToolRegistry(policy)
    descriptions = {
        "discover_evidence": "Search approved scholarly and official indexes; never search news or media.",
        "retrieve_candidate": "Retrieve one approved source and its provenance metadata.",
        "inspect_document": "Extract claim-addressable passages and page/section locators.",
        "verify_claim_support": "Check whether excerpts entail a claim and record limitations.",
        "search_policy_knowledge_base": "Search the curated internal policy document collection.",
    }
    for name, schema in schemas.items():
        registry.register(Tool(name, descriptions[name], schema, handlers[name]))
    return registry
