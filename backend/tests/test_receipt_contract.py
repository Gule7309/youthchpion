from app.main import _has_complete_verification_receipts
from app.models import VerifiedClaim


def claim(**updates) -> VerifiedClaim:
    values = {
        "claim_id": "claim-1",
        "evidence_id": "ev-1",
        "claim": "AI changes task composition.",
        "excerpt": "The report describes changes in task composition.",
        "locator": "HTML block 1",
        "support": "direct",
        "source_title": "Report",
        "source_url": "https://oecd.org/report",
    }
    values.update(updates)
    return VerifiedClaim.model_validate(values)


def test_legacy_claim_without_receipt_cannot_feed_policy_generation() -> None:
    assert not _has_complete_verification_receipts([claim()], ["ev-1"])


def test_complete_receipt_covers_every_requested_evidence() -> None:
    complete = claim(
        retrieved_url="https://oecd.org/report",
        content_sha256="a" * 64,
        authority_basis="allowlisted international organization",
    )

    assert _has_complete_verification_receipts([complete], ["ev-1"])
    assert not _has_complete_verification_receipts([complete], ["ev-1", "ev-2"])
