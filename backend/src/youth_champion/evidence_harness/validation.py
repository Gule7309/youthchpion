from __future__ import annotations

from dataclasses import replace

from .contracts import AgentPhase, EvidencePackage, ResearchRequest
from .source_policy import SourcePolicy, SourcePolicyError


class PublicationError(ValueError):
    pass


class PublicationGate:
    def __init__(self, policy: SourcePolicy):
        self._policy = policy

    def validate(self, request: ResearchRequest, package: EvidencePackage) -> EvidencePackage:
        errors: list[str] = []
        seen_claims: set[str] = set()
        for item in package.items:
            try:
                self._policy.validate(item.source)
            except SourcePolicyError as exc:
                errors.append(f"{item.claim_id}: {exc}")
            if not item.excerpts:
                errors.append(f"{item.claim_id}: no evidence excerpt")
            if any(excerpt.source_id != item.source.source_id for excerpt in item.excerpts):
                errors.append(f"{item.claim_id}: excerpt/source mismatch")
            if any(item.claim_id not in excerpt.claim_ids for excerpt in item.excerpts):
                errors.append(f"{item.claim_id}: excerpt does not map to claim")
            seen_claims.add(item.claim_id)

        if errors:
            raise PublicationError("; ".join(errors))

        missing = [claim for claim in request.required_claims if claim not in seen_claims]
        if missing:
            gaps = tuple(dict.fromkeys((*package.gaps, *(f"missing claim: {x}" for x in missing))))
            return replace(package, gaps=gaps, status=AgentPhase.PARTIAL)
        return replace(package, status=AgentPhase.COMPLETED)

