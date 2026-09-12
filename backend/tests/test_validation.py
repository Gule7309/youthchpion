import pytest

from app.evidence_harness.contracts import (
    ContentType,
    EvidenceExcerpt,
    EvidenceItem,
    EvidencePackage,
    ResearchRequest,
    SourceCandidate,
    SourceOwnerType,
)
from app.evidence_harness.source_policy import SourcePolicy
from app.evidence_harness.validation import PublicationError, PublicationGate

SOURCE = SourceCandidate(
    source_id="oecd-1",
    title="OECD Employment Outlook",
    url="https://oecd.org/report",
    owner_type=SourceOwnerType.INTERNATIONAL_ORGANIZATION,
    content_type=ContentType.INTERNATIONAL_REPORT,
    publisher="OECD",
)


def item() -> EvidenceItem:
    excerpt = EvidenceExcerpt("oecd-1", "supported passage", "p. 12", ("claim-1",))
    return EvidenceItem("claim-1", "AI changes task composition", SOURCE, (excerpt,), "direct")


def test_package_question_must_match_request() -> None:
    with pytest.raises(PublicationError, match="question does not match"):
        PublicationGate(SourcePolicy()).validate(
            ResearchRequest("Original question"),
            EvidencePackage("Different question", (item(),)),
        )


def test_duplicate_claim_ids_are_rejected() -> None:
    with pytest.raises(PublicationError, match="duplicate claim id"):
        PublicationGate(SourcePolicy()).validate(
            ResearchRequest("What changes?"),
            EvidencePackage("What changes?", (item(), item())),
        )
