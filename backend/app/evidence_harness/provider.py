from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from .contracts import AgentAction, HarnessState


class ModelProvider(Protocol):
    def next_action(self, state: HarnessState, tool_schemas: list[dict]) -> AgentAction: ...


class ScriptedProvider:
    """Deterministic provider for tests and local contract development."""

    def __init__(self, actions: Iterable[AgentAction]):
        self._actions = iter(actions)

    def next_action(self, state: HarnessState, tool_schemas: list[dict]) -> AgentAction:
        del state, tool_schemas
        return next(self._actions)
