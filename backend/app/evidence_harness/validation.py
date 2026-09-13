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
        if package.question != request.question:
            errors.append("package question does not match request")
        for item in package.items:
            if item.claim_id in seen_claims:
                errors.append(f"{item.claim_id}: duplicate claim id")
            if not item.claim.strip():
                errors.append(f"{item.claim_id}: empty claim")
            if not item.support.strip():
                errors.append(f"{item.claim_id}: empty support")
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
            if any(not excerpt.text.strip() for excerpt in item.excerpts):
                errors.append(f"{item.claim_id}: empty evidence excerpt")
            if any(not excerpt.locator.strip() for excerpt in item.excerpts):
                errors.append(f"{item.claim_id}: empty evidence locator")
            seen_claims.add(item.claim_id)

        if errors:
            raise PublicationError("; ".join(errors))

        missing = [claim for claim in request.required_claims if claim not in seen_claims]
        if missing:
            gaps = tuple(dict.fromkeys((*package.gaps, *(f"missing claim: {x}" for x in missing))))
            return replace(package, gaps=gaps, status=AgentPhase.PARTIAL)
        return replace(package, status=AgentPhase.COMPLETED)
