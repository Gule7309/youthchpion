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
    async def get(self, url: str, redirect_validator=None) -> HttpPayload:
        del redirect_validator
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
    assert result.claims[0].content_sha256
    assert str(result.claims[0].retrieved_url) == "https://ilo.org/report"
    assert result.harness is not None
    assert result.harness.model_calls == 1
    assert result.harness.approved_claims == 1
    assert result.claims[0].taiwan_applicability == "TRANSFER_REQUIRES_LOCAL_VALIDATION"
    assert result.taiwan_applicability.status == "INSUFFICIENT_TAIWAN_CONTEXT"


@pytest.mark.asyncio
async def test_authority_agent_separates_taiwan_context_from_local_policy_effect(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.evidence_agent.settings",
        replace(settings, bedrock_model_id="test-model", bedrock_min_interval_ms=0),
    )
    item = EvidenceItem(
        evidence_id="authority_taiwanjobs_survey",
        title="2024 AI世代的求才條件大調查",
        institution="勞動部勞動力發展署／台灣就業通",
        published_at="2024",
        evidence_type="government labour-market survey",
        authority_tier="A",
        url="https://event.taiwanjobs.gov.tw/2024/survey/02/index.html",
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
                "claim": "The survey describes employer skill signals.",
                "passage_index": 0,
                "support": "direct",
                "limitations": ["This is not an impact evaluation."],
            }
        ),
    )

    result = await agent.verify(
        "run_test",
        "What changes?",
        [item],
        local_context={
            "occupation_code": "4",
            "occupation_name": "事務支援人員",
            "source_ids": ["dgbas_employment", "mol_vacancy_history", "taiwanjobs"],
        },
    )

    assert result.claims[0].taiwan_applicability == "DIRECT_TAIWAN_CONTEXT"
    assert result.taiwan_applicability.status == "TAIWAN_CONTEXT_WITH_TRANSFER_EVIDENCE"
    assert result.taiwan_applicability.taiwan_problem_context_supported is True
    assert result.taiwan_applicability.taiwan_intervention_effect_supported is False
    assert "90 天台灣試辦" in result.taiwan_applicability.required_local_validation[0]


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


@pytest.mark.asyncio
async def test_authority_agent_rejects_redirect_to_news_before_bedrock(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.evidence_agent.settings",
        replace(settings, bedrock_model_id="test-model", bedrock_min_interval_ms=0),
    )

    class RedirectHttp:
        async def get(self, url: str, redirect_validator=None) -> HttpPayload:
            del url
            if redirect_validator:
                redirect_validator("https://news.bbc.com/story")
            return HttpPayload(
                url="https://news.bbc.com/story",
                status_code=200,
                content_type="text/html",
                body=b"<main><p>This paragraph is long enough to be selected as evidence. "
                b"It is nevertheless a prohibited media redirect and must be rejected.</p></main>",
            )

    item = EvidenceItem(
        evidence_id="oa_redirect",
        title="Indexed article",
        institution="Test Journal",
        published_at="2026",
        evidence_type="article",
        authority_tier="B",
        doi="https://doi.org/10.1000/redirect",
        url="https://doi.org/10.1000/redirect",
        retrieved_at=datetime.now(UTC),
        freshness=FreshnessStatus.LIVE,
        discovery_source="openalex",
    )
    agent = AuthorityEvidenceAgent(http=RedirectHttp())
    called = False

    def converse(_: dict) -> str:
        nonlocal called
        called = True
        return "{}"

    monkeypatch.setattr(agent, "_converse", converse)

    result = await agent.verify("run_test", "What changes?", [item])

    assert result.status == "PARTIAL"
    assert not result.approved_evidence_ids
    assert "原文取回失敗" in result.gaps[0]
    assert called is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        '{"supported":"false","claim":null,"passage_index":null,"support":null,"limitations":[]}',
        '{"supported":true,"claim":"claim","passage_index":true,"support":"direct","limitations":[]}',
        '{"supported":true,"claim":"claim","passage_index":-1,"support":"direct","limitations":[]}',
        '{"supported":true,"claim":"claim","passage_index":0,"support":"direct","limitations":"none"}',
    ],
)
async def test_invalid_model_contract_fails_closed(monkeypatch, raw: str) -> None:
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
        freshness=FreshnessStatus.VERSIONED,
    )
    agent = AuthorityEvidenceAgent(http=FakeHttp())
    monkeypatch.setattr(agent, "_converse", lambda _: raw)

    result = await agent.verify("run_test", "What changes?", [item])

    assert result.status == "PARTIAL"
    assert not result.claims
    assert "Bedrock 核對失敗" in result.gaps[0]
