from __future__ import annotations

from dataclasses import dataclass

from .contracts import (
    AgentPhase,
    EvidencePackage,
    FinalAnswer,
    HarnessState,
    ResearchRequest,
    SourceCandidate,
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
        if request.max_sources < 1:
            raise ToolProtocolError("max_sources must be positive")
        state = HarnessState(request=request)
        call_ids: set[str] = set()
        while state.step < self.config.max_steps:
            try:
                action = self.provider.next_action(state, self.tools.schemas())
            except StopIteration as exc:
                raise ToolProtocolError("provider stopped before publication") from exc
            state.step += 1
            if isinstance(action, ToolCall):
                if action.call_id in call_ids:
                    raise ToolProtocolError(f"duplicate tool call id: {action.call_id}")
                call_ids.add(action.call_id)
                output, next_phase = self.tools.execute(state.phase, action.name, action.arguments)
                if action.name == "discover_evidence":
                    output = {
                        **output,
                        "candidates": output["candidates"][: request.max_sources],
                    }
                state.observations.append(
                    ToolObservation(action.call_id, action.name, output, action.arguments)
                )
                state.phase = next_phase
                continue
            if isinstance(action, FinalAnswer):
                if state.phase is not AgentPhase.VERIFYING:
                    raise ToolProtocolError("provider attempted publication before verification")
                self._validate_provenance(state, action.package)
                return self.gate.validate(request, action.package)
            raise ToolProtocolError(f"unsupported provider action: {type(action).__name__}")
        raise ToolProtocolError(f"maximum step count exceeded: {self.config.max_steps}")

    @staticmethod
    def _validate_provenance(state: HarnessState, package: EvidencePackage) -> None:
        discovered: dict[str, SourceCandidate] = {}
        retrieved: set[str] = set()
        inspected: dict[str, set[tuple[str, str]]] = {}
        verified: set[tuple[str, str, str]] = set()

        for observation in state.observations:
            if observation.tool_name == "discover_evidence":
                for candidate in observation.output.get("candidates", []):
                    existing = discovered.get(candidate.source_id)
                    if existing is not None and existing != candidate:
                        raise ToolProtocolError(
                            f"duplicate discovered source id: {candidate.source_id}"
                        )
                    discovered[candidate.source_id] = candidate
            elif observation.tool_name == "retrieve_candidate":
                source_id = observation.arguments.get("source_id")
                if isinstance(source_id, str):
                    retrieved.add(source_id)
            elif observation.tool_name == "inspect_document":
                source_id = observation.arguments.get("source_id")
                if isinstance(source_id, str):
                    inspected.setdefault(source_id, set()).update(
                        EvidenceHarness._excerpt_texts(observation.output)
                    )
            elif observation.tool_name == "verify_claim_support":
                if not isinstance(observation.output, dict) or observation.output.get(
                    "supported"
                ) is not True:
                    continue
                claim_id = observation.arguments.get("claim_id")
                source_ids = observation.arguments.get("source_ids", [])
                locators = observation.arguments.get("excerpt_locators", [])
                if (
                    isinstance(claim_id, str)
                    and isinstance(source_ids, list)
                    and isinstance(locators, list)
                ):
                    verified.update(
                        (claim_id, source_id, locator)
                        for source_id in source_ids
                        for locator in locators
                        if isinstance(source_id, str)
                        and isinstance(locator, str)
                    )

        if not verified:
            raise ToolProtocolError(
                "provider attempted publication without a supported verification"
            )
        for item in package.items:
            source_id = item.source.source_id
            if source_id not in discovered:
                raise ToolProtocolError(f"source was not discovered in this run: {source_id}")
            if item.source != discovered[source_id]:
                raise ToolProtocolError(
                    f"published source differs from discovery receipt: {source_id}"
                )
            if source_id not in retrieved:
                raise ToolProtocolError(f"source was not retrieved in this run: {source_id}")
            if any(
                (item.claim_id, source_id, excerpt.locator) not in verified
                for excerpt in item.excerpts
            ):
                raise ToolProtocolError(
                    "claim/source/locator has no supported verification receipt: "
                    f"{item.claim_id}/{source_id}"
                )
            inspected_excerpts = inspected.get(source_id, set())
            if any(
                (excerpt.text, excerpt.locator) not in inspected_excerpts
                for excerpt in item.excerpts
            ):
                raise ToolProtocolError(
                    f"published excerpt was not inspected in this run: {item.claim_id}/{source_id}"
                )

    @staticmethod
    def _excerpt_texts(output: object) -> set[tuple[str, str]]:
        if not isinstance(output, dict):
            return set()
        values = output.get("excerpts", [])
        if not isinstance(values, list):
            return set()
        return {
            (value.get("text"), value.get("locator"))
            for value in values
            if isinstance(value, dict)
            and isinstance(value.get("text"), str)
            and isinstance(value.get("locator"), str)
        }
