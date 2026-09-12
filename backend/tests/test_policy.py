from __future__ import annotations

import json

import pytest

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
    raw = json.dumps({"options": [option("unknown") for _ in range(3)]})

    with pytest.raises(PolicyGenerationError, match="unknown evidence"):
        BedrockPolicyService._validate(raw, {"ev_1"})


def test_policy_contract_rejects_invented_percentage() -> None:
    raw = json.dumps(
        {"options": [option(mechanism="成效提高 95%"), option(), option()]},
        ensure_ascii=False,
    )

    with pytest.raises(PolicyGenerationError, match="percentage"):
        BedrockPolicyService._validate(raw, {"ev_1"})
