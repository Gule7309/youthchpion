from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime

import pytest

from app.config import settings
from app.evidence_agent import AuthorityEvidenceAgent
from app.http import HttpPayload
from app.models import EvidenceItem, FreshnessStatus


class FakeHttp:
    async def get(self, url: str) -> HttpPayload:
        return HttpPayload(
            url=url,
            status_code=200,
            content_type="text/html",
            body=(
                b"<main><p>This report examines how generative AI changes the task composition "
                b"of clerical occupations and emphasizes job transformation over full replacement."
                b"</p></main>"
            ),
        )


@pytest.mark.asyncio
async def test_authority_agent_retrieves_original_passage_and_publishes(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.evidence_agent.settings",
        replace(settings, bedrock_model_id="test-model", bedrock_min_interval_ms=0),
    )
    item = EvidenceItem(
        evidence_id="authority_ilo",
        title="Generative AI and Jobs",
        institution="International Labour Organization",
        published_at="2025",
        evidence_type="international technical report",
        authority_tier="A",
        method_summary="Task-level occupation analysis.",
        finding="AI is more likely to transform work than replace whole jobs.",
        limitations="Not a Taiwan unemployment forecast.",
        url="https://ilo.org/report",
        retrieved_at=datetime.now(UTC),
        freshness=FreshnessStatus.VERSIONED,
    )
    agent = AuthorityEvidenceAgent(http=FakeHttp())
    monkeypatch.setattr(
        agent,
        "_converse",
        lambda _: json.dumps(
            {
                "supported": True,
                "claim": "Generative AI can transform clerical task composition.",
                "passage_index": 0,
                "support": "direct",
                "limitations": ["This does not estimate unemployment."],
            }
        ),
    )

    result = await agent.verify("run_test", "What changes?", [item])

    assert result.status == "COMPLETED"
    assert result.approved_evidence_ids == ["authority_ilo"]
    assert result.claims[0].locator == "HTML block 1"
    assert result.claims[0].excerpt.startswith("This report examines")


@pytest.mark.asyncio
async def test_authority_agent_runs_live_search_before_verification(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.evidence_agent.settings",
        replace(settings, bedrock_model_id="test-model", bedrock_min_interval_ms=0),
    )
    item = EvidenceItem(
        evidence_id="authority_ilo",
        title="Generative AI and Jobs",
        institution="International Labour Organization",
        published_at="2025",
        evidence_type="international technical report",
        authority_tier="A",
        url="https://ilo.org/report",
        retrieved_at=datetime.now(UTC),
        freshness=FreshnessStatus.LIVE,
    )
    calls: list[tuple[str, int]] = []

    async def search(query: str, limit: int) -> list[EvidenceItem]:
        calls.append((query, limit))
        return [item]

    agent = AuthorityEvidenceAgent(http=FakeHttp())
    monkeypatch.setattr(
        agent,
        "_converse",
        lambda _: json.dumps(
            {
                "supported": True,
                "claim": "Generative AI can transform clerical task composition.",
                "passage_index": 0,
                "support": "direct",
                "limitations": [],
            }
        ),
    )

    result = await agent.research(
        "run_test", "AI youth employment", "What changes?", search, []
    )

    assert calls == [("AI youth employment", 8)]
    assert result.searched_candidates == [item]
    assert "OpenAlex" in result.agent_steps[0]


@pytest.mark.asyncio
async def test_authority_agent_reports_gap_when_source_policy_rejects_news(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.evidence_agent.settings",
        replace(settings, bedrock_model_id="test-model", bedrock_min_interval_ms=0),
    )
    item = EvidenceItem(
        evidence_id="news_1",
        title="News interview",
        institution="BBC News",
        evidence_type="expert interview",
        authority_tier="D",
        url="https://news.bbc.com/story",
        retrieved_at=datetime.now(UTC),
        freshness=FreshnessStatus.LIVE,
    )

    result = await AuthorityEvidenceAgent(http=FakeHttp()).verify(
        "run_test",
        "What changes?",
        [item],
    )

    assert result.status == "PARTIAL"
    assert not result.approved_evidence_ids
    assert "來源規則未通過" in result.gaps[0]
