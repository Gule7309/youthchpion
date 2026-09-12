import unittest

from app.evidence_harness.contracts import (
    ContentType,
    EvidenceExcerpt,
    EvidenceItem,
    EvidencePackage,
    FinalAnswer,
    ResearchRequest,
    SourceCandidate,
    SourceOwnerType,
    ToolCall,
)
from app.evidence_harness.factory import build_tool_registry
from app.evidence_harness.provider import ScriptedProvider
from app.evidence_harness.runner import EvidenceHarness, HarnessConfig
from app.evidence_harness.source_policy import SourcePolicy
from app.evidence_harness.tools import ToolProtocolError
from app.evidence_harness.validation import PublicationGate


SOURCE = SourceCandidate(
    source_id="oecd-1",
    title="OECD Employment Outlook",
    url="https://oecd.org/report.pdf",
    owner_type=SourceOwnerType.INTERNATIONAL_ORGANIZATION,
    content_type=ContentType.INTERNATIONAL_REPORT,
    publisher="OECD",
)


def registry(policy):
    return build_tool_registry({
        "discover_evidence": lambda _: [SOURCE],
        "retrieve_candidate": lambda _: {"body": "document"},
        "inspect_document": lambda _: {"excerpts": ["supported passage"]},
        "verify_claim_support": lambda _: {"supported": True},
        "search_policy_knowledge_base": lambda _: [],
    }, policy)


def package():
    excerpt = EvidenceExcerpt("oecd-1", "supported passage", "p. 12", ("claim-1",))
    item = EvidenceItem("claim-1", "AI changes task composition", SOURCE, (excerpt,), "direct")
    return EvidencePackage("What changes?", (item,))


class HarnessTests(unittest.TestCase):
    def test_end_to_end_requires_search_retrieve_inspect_verify_then_publish(self):
        actions = [
            ToolCall("1", "discover_evidence", {"query": "AI employment"}),
            ToolCall("2", "retrieve_candidate", {"source_id": "oecd-1"}),
            ToolCall("3", "inspect_document", {"source_id": "oecd-1", "claim_ids": ["claim-1"]}),
            ToolCall("4", "verify_claim_support", {"claim_id": "claim-1", "source_ids": ["oecd-1"]}),
            FinalAnswer(package()),
        ]
        policy = SourcePolicy()
        result = EvidenceHarness(ScriptedProvider(actions), registry(policy), PublicationGate(policy)).run(
            ResearchRequest("What changes?", required_claims=("claim-1",))
        )
        self.assertEqual(result.status.value, "completed")

    def test_cannot_publish_before_verification(self):
        policy = SourcePolicy()
        harness = EvidenceHarness(ScriptedProvider([FinalAnswer(package())]), registry(policy), PublicationGate(policy))
        with self.assertRaisesRegex(ToolProtocolError, "before verification"):
            harness.run(ResearchRequest("What changes?"))

    def test_max_steps_is_enforced(self):
        policy = SourcePolicy()
        actions = [ToolCall("1", "discover_evidence", {"query": "x"})]
        harness = EvidenceHarness(
            ScriptedProvider(actions), registry(policy), PublicationGate(policy), HarnessConfig(max_steps=1)
        )
        with self.assertRaisesRegex(ToolProtocolError, "maximum step"):
            harness.run(ResearchRequest("x"))

    def test_tool_is_rejected_outside_its_phase(self):
        policy = SourcePolicy()
        actions = [ToolCall("1", "verify_claim_support", {"claim_id": "c", "source_ids": []})]
        harness = EvidenceHarness(ScriptedProvider(actions), registry(policy), PublicationGate(policy))
        with self.assertRaisesRegex(ToolProtocolError, "forbidden during phase"):
            harness.run(ResearchRequest("x"))


if __name__ == "__main__":
    unittest.main()
