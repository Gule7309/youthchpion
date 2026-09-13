from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime

import pytest

from app.config import settings
from app.models import (
    EvidenceItem,
    FreshnessStatus,
    OccupationSignal,
    TaiwanApplicabilityAssessment,
    VerifiedClaim,
)
from app.policy import BedrockPolicyService, PolicyGenerationError


def option(evidence_id: str = "ev_1", mechanism: str = "企業共訓") -> dict:
    return {
        "title": mechanism,
        "target_group": "青年",
        "problem": "技能落差",
        "mechanism": mechanism,
        "implementation": ["建立試辦"],
        "kpis": [{"name": "就業成效", "target": "pilot-defined"}],
        "evidence_ids": [evidence_id],
        "risks": ["選擇偏誤"],
        "limitations": ["需試辦驗證"],
    }


def test_policy_contract_requires_three_options_and_known_evidence() -> None:
    raw = json.dumps(
        {"options": [option(), option(mechanism="職務再設計"), option(mechanism="媒合")]}
    )

    result = BedrockPolicyService._validate(raw, {"ev_1"})

    assert len(result) == 3


def test_policy_contract_rejects_unknown_citation() -> None:
    raw = json.dumps(
        {
            "options": [
                option("unknown", "企業共訓"),
                option("unknown", "職務再設計"),
                option("unknown", "媒合"),
            ]
        }
    )

    with pytest.raises(PolicyGenerationError, match="unknown evidence"):
        BedrockPolicyService._validate(raw, {"ev_1"})


def test_policy_contract_rejects_invented_percentage() -> None:
    raw = json.dumps(
        {"options": [option(mechanism="成效提高 95%"), option(), option()]},
        ensure_ascii=False,
    )

    with pytest.raises(PolicyGenerationError, match="percentage"):
        BedrockPolicyService._validate(raw, {"ev_1"})


def test_policy_contract_allows_percentage_already_present_in_signal() -> None:
    raw = json.dumps(
        {
            "options": [
                option(mechanism="青年占比 15.2% 的職類試辦"),
                option(mechanism="職務再設計"),
                option(mechanism="媒合"),
            ]
        },
        ensure_ascii=False,
    )

    result = BedrockPolicyService._validate(raw, {"ev_1"}, {15.0, 15.2, 15.24})

    assert len(result) == 3


def test_policy_contract_requires_taiwan_pilot_for_transfer_evidence() -> None:
    without_pilot = option()
    without_pilot["implementation"] = ["直接全面推動"]
    without_pilot["limitations"] = ["尚無台灣成效研究"]
    raw = json.dumps(
        {
            "options": [
                without_pilot,
                {**without_pilot, "title": "職務再設計"},
                {**without_pilot, "title": "媒合"},
            ]
        },
        ensure_ascii=False,
    )

    with pytest.raises(PolicyGenerationError, match="local pilot"):
        BedrockPolicyService._validate(raw, {"ev_1"}, require_local_pilot=True)

    with_pilot = json.dumps(
        {"options": [option(), option(mechanism="職務再設計"), option(mechanism="媒合")]},
        ensure_ascii=False,
    )
    assert len(
        BedrockPolicyService._validate(
            with_pilot,
            {"ev_1"},
            require_local_pilot=True,
        )
    ) == 3


def test_policy_contract_requires_distinct_mechanisms_and_evidence_synthesis() -> None:
    evidence_ids = {"local", "exposure", "intervention"}
    apprenticeship = option("intervention", "有薪專案型學徒制")
    apprenticeship["evidence_ids"] = sorted(evidence_ids)
    redesign = option("intervention", "企業初階職務再設計")
    redesign["evidence_ids"] = sorted(evidence_ids)
    employment_service = option("intervention", "精準就業服務與媒合")
    employment_service["evidence_ids"] = sorted(evidence_ids)
    raw = json.dumps(
        {"options": [apprenticeship, redesign, employment_service]},
        ensure_ascii=False,
    )

    result = BedrockPolicyService._validate(
        raw,
        evidence_ids,
        require_evidence_synthesis=True,
    )

    assert len(result) == 3


def test_policy_contract_rejects_three_near_duplicate_training_options() -> None:
    evidence_ids = {"local", "exposure", "intervention"}
    options = []
    for title in ("AI 技能培訓", "AI 技能認證", "AI 線上課程"):
        value = option("intervention", title)
        value["evidence_ids"] = sorted(evidence_ids)
        options.append(value)

    with pytest.raises(PolicyGenerationError, match="three distinct mechanisms"):
        BedrockPolicyService._validate(
            json.dumps({"options": options}, ensure_ascii=False),
            evidence_ids,
            require_evidence_synthesis=True,
        )


@pytest.mark.asyncio
async def test_policy_generation_corrects_an_invalid_first_contract(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.policy.settings",
        replace(settings, bedrock_model_id="test-model", bedrock_min_interval_ms=0),
    )
    signal = OccupationSignal(
        code="4",
        name="事務支援人員",
        youth_employed=291000,
        youth_employment_share=0.1524,
        exposure_level="Gradient 4",
        exposure_score=0.5355,
        ai_entry_jobs=0,
        total_entry_jobs=517,
        ai_entry_opportunity_rate=0,
        priority="high",
        source_snapshot_ids=["dgbas_employment", "ilo_genai_exposure"],
    )
    evidence = EvidenceItem(
        evidence_id="ev_1",
        title="Evidence",
        institution="Institution",
        url="https://example.com/evidence",
        retrieved_at=datetime.now(UTC),
        freshness=FreshnessStatus.LIVE,
        evidence_type="report",
    )
    verified_claim = VerifiedClaim(
        claim_id="claim-1",
        evidence_id="ev_1",
        claim="AI changes task composition.",
        excerpt="The study found changes in task composition.",
        locator="HTML block 1",
        support="direct",
        source_title="Evidence",
        source_url="https://example.com/evidence",
    )
    invalid = json.dumps({"options": [option()]})
    valid = json.dumps(
        {"options": [option(), option(mechanism="職務再設計"), option(mechanism="媒合")]}
    )
    outputs = iter((invalid, valid))
    payloads: list[dict] = []
    service = BedrockPolicyService()

    def fake_converse(payload: dict) -> str:
        payloads.append(payload)
        return next(outputs)

    monkeypatch.setattr(service, "_converse", fake_converse)
    applicability = TaiwanApplicabilityAssessment(
        status="TAIWAN_CONTEXT_WITH_TRANSFER_EVIDENCE",
        occupation_code="4",
        occupation_name="事務支援人員",
        taiwan_problem_context_supported=True,
        taiwan_intervention_effect_supported=False,
        conclusion="台灣問題存在，但介入成效仍須本地驗證。",
        required_local_validation=["執行 90 天台灣試辦"],
    )

    response = await service.generate(
        "run_1",
        signal,
        "降低技能落差",
        [evidence],
        [verified_claim],
        applicability,
    )

    assert len(response.options) == 3
    assert len(payloads) == 2
    assert "exactly three" in payloads[1]["contract_correction"]["previous_error"]
    assert payloads[0]["allowed_percentage_values"] == [0.0, 15.0, 15.2, 15.24]
    assert payloads[0]["verified_claims"][0]["excerpt"].startswith("The study")
    assert "finding" not in payloads[0]["evidence_metadata"][0]
    assert payloads[0]["taiwan_applicability"]["occupation_code"] == "4"
    assert response.warnings == ["台灣問題存在，但介入成效仍須本地驗證。"]
