from __future__ import annotations

from dataclasses import dataclass

from .contracts import (
    AgentPhase,
    EvidencePackage,
    FinalAnswer,
    HarnessState,
    ResearchRequest,
    ToolCall,
    ToolObservation,
)
from .provider import ModelProvider
from .tools import ToolProtocolError, ToolRegistry
from .validation import PublicationGate


@dataclass(frozen=True)
class HarnessConfig:
    max_steps: int = 20


class EvidenceHarness:
    """Bounded state machine around an interchangeable model provider and tool registry."""

    def __init__(
        self,
        provider: ModelProvider,
        tools: ToolRegistry,
        gate: PublicationGate,
        config: HarnessConfig | None = None,
    ):
        self.provider = provider
        self.tools = tools
        self.gate = gate
        self.config = config or HarnessConfig()

    def run(self, request: ResearchRequest) -> EvidencePackage:
        state = HarnessState(request=request)
        while state.step < self.config.max_steps:
            action = self.provider.next_action(state, self.tools.schemas())
            state.step += 1
            if isinstance(action, ToolCall):
                output, next_phase = self.tools.execute(state.phase, action.name, action.arguments)
                state.observations.append(ToolObservation(action.call_id, action.name, output))
                state.phase = next_phase
                continue
            if isinstance(action, FinalAnswer):
                if state.phase is not AgentPhase.VERIFYING:
                    raise ToolProtocolError("provider attempted publication before verification")
                return self.gate.validate(request, action.package)
            raise ToolProtocolError(f"unsupported provider action: {type(action).__name__}")
        raise ToolProtocolError(f"maximum step count exceeded: {self.config.max_steps}")
