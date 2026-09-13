from __future__ import annotations

import pytest

from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.pipeline import build_dashboard
from app.sources.base import AdapterResult


def snapshot(source_id: str, rows: int) -> SourceSnapshot:
    return SourceSnapshot(
        source_id=source_id,
        status=FreshnessStatus.LIVE,
        source_url=f"https://example.com/{source_id}",
        retrieved_at=utc_now(),
        raw_rows=rows,
        normalized_rows=rows,
    )


def test_dashboard_calculates_youth_share_from_youth_total() -> None:
    results = {
        "dgbas_employment": AdapterResult(
            snapshot("dgbas_employment", 2),
            [
                {
                    "code": "2",
                    "name": "專業",
                    "youth_employed": 30,
                    "youth_employed_20_24": 30,
                    "youth_employed_25_29": 40,
                    "total_employed": 100,
                },
                {
                    "code": "4",
                    "name": "事務",
                    "youth_employed": 70,
                    "youth_employed_20_24": 70,
                    "youth_employed_25_29": 60,
                    "total_employed": 200,
                },
            ],
        ),
        "ilo_genai_exposure": AdapterResult(
            snapshot("ilo_genai_exposure", 2),
            [
                {
                    "code": "2",
                    "exposure_score": 0.2,
                    "exposure_level": "low",
                    "occupation_count": 1,
                },
                {
                    "code": "4",
                    "exposure_score": 0.6,
                    "exposure_level": "high",
                    "occupation_count": 1,
                },
            ],
        ),
        "taiwanjobs": AdapterResult(
            snapshot("taiwanjobs", 2),
            [
                {"occupation_code": "2", "entry_level": True, "headcount": 40, "ai_related": True},
                {"occupation_code": "4", "entry_level": True, "headcount": 80, "ai_related": False},
            ],
        ),
        "job104_research": AdapterResult(
            snapshot("job104_research", 1), [{"title": "AI 採用調查"}]
        ),
        "mol_vacancy_history": AdapterResult(
            snapshot("mol_vacancy_history", 2),
            [
                {
                    "code": "2",
                    "new_vacancies": 90,
                    "previous_new_vacancies": 100,
                    "yoy_change": -0.1,
                    "three_year_change": -0.05,
                    "recruitment_weakening": 0.5,
                    "weakening_sensitivity": {"0.1": 1.0, "0.2": 0.5, "0.3": 0.333333},
                },
                {
                    "code": "4",
                    "new_vacancies": 110,
                    "previous_new_vacancies": 100,
                    "yoy_change": 0.1,
                    "three_year_change": 0.2,
                    "recruitment_weakening": 0.0,
                    "weakening_sensitivity": {"0.1": 0.0, "0.2": 0.0, "0.3": 0.0},
                },
            ],
        ),
        "moda_public_opinion": AdapterResult(
            snapshot("moda_public_opinion", 1),
            [{"label": "青年主觀感受", "value": 35.0, "survey_year": 2025}],
        ),
    }

    dashboard = build_dashboard("run_test", results, [])

    professional = next(item for item in dashboard.occupation_signals if item.code == "2")
    clerical = next(item for item in dashboard.occupation_signals if item.code == "4")
    assert professional.youth_employment_share == 0.3
    assert clerical.youth_employment_share == 0.35
    assert professional.occupation_share_of_youth == 0.3
    assert clerical.occupation_share_of_youth == 0.7
    assert professional.ai_entry_opportunity_rate == 1.0
    assert clerical.ai_entry_opportunity_rate == 0.0
    assert professional.ai_entry_opportunity_status == "READY_EXPERIMENTAL"
    assert professional.youth_concentration_index is None
    assert clerical.opportunity_gap is None
    assert professional.recruitment_weakening == 0.5
    assert clerical.recruitment_weakening == 0.0
    assert professional.transformation_priority_score == pytest.approx(24.5, abs=0.1)
    assert clerical.transformation_priority_score == pytest.approx(45.8, abs=0.1)
    assert professional.structural_exposure_score == professional.transformation_priority_score
    assert professional.score_status == "EXPERIMENTAL"
    assert professional.score_formula == "100 × sqrt(A × B)"
    assert professional.data_confidence == "MEDIUM"
    assert dashboard.summary_metrics["youth_employed_20_24"] == 100
    assert dashboard.summary_metrics["youth_employed_25_29"] == 100
    assert dashboard.cleaning_summary.crosswalk_coverage == 1.0
    assert dashboard.summary_metrics["score_status"] == "EXPERIMENTAL"
    assert dashboard.summary_metrics["score_formula"] == "100 × sqrt(A × B)"
    assert dashboard.industry_context == [{"title": "AI 採用調查"}]
    assert dashboard.public_opinion == [
        {"label": "青年主觀感受", "value": 35.0, "survey_year": 2025}
    ]
    assert {ref.source_id for ref in professional.source_snapshot_refs} == {
        "dgbas_employment",
        "ilo_genai_exposure",
        "mol_vacancy_history",
        "taiwanjobs",
    }

    results["dgbas_microdata_18_35"] = AdapterResult(
        snapshot("dgbas_microdata_18_35", 2),
        [
            {
                "code": "2",
                "name": "專業",
                "youth_employed": 80,
                "youth_employed_18_24": 20,
                "youth_employed_20_24": 15,
                "youth_employed_25_29": 25,
                "youth_employed_30_35": 35,
                "youth_employed_18_35": 80,
                "total_employed": 200,
            },
            {
                "code": "4",
                "name": "事務",
                "youth_employed": 20,
                "youth_employed_18_24": 5,
                "youth_employed_20_24": 4,
                "youth_employed_25_29": 5,
                "youth_employed_30_35": 10,
                "youth_employed_18_35": 20,
                "total_employed": 100,
            },
        ],
    )
    exact = build_dashboard("run_exact_18_35", results, [])
    exact_professional = next(
        item for item in exact.occupation_signals if item.code == "2"
    )

    assert exact.summary_metrics["analysis_population_label"] == "18–35 歲"
    assert exact.summary_metrics["analysis_population_exact"] is True
    assert exact.summary_metrics["analysis_population_source_id"] == (
        "dgbas_microdata_18_35"
    )
    assert exact.summary_metrics["youth_employed_18_35"] == 100
    assert exact.summary_metrics["youth_employed_20_24"] == 19
    assert exact_professional.youth_employed == 80
    assert exact_professional.youth_employment_share == 0.4
    assert exact_professional.occupation_share_of_youth == 0.8
    assert "dgbas_microdata_18_35" in exact_professional.source_snapshot_ids
    assert "dgbas_employment" not in exact_professional.source_snapshot_ids


def test_dashboard_withholds_d_when_ai_positive_mapping_coverage_is_low() -> None:
    results = {
        "dgbas_employment": AdapterResult(
            snapshot("dgbas_employment", 1),
            [{
                "code": "2", "name": "專業", "youth_employed": 30,
                "youth_employed_20_24": 30, "youth_employed_25_29": 40,
                "total_employed": 100,
            }],
        ),
        "ilo_genai_exposure": AdapterResult(
            snapshot("ilo_genai_exposure", 1),
            [{"code": "2", "exposure_score": 0.2, "exposure_level": "low", "occupation_count": 1}],
        ),
        "taiwanjobs": AdapterResult(
            snapshot("taiwanjobs", 2),
            [
                {"occupation_code": "2", "entry_level": True, "headcount": 40, "ai_related": False},
                {"occupation_code": None, "entry_level": True, "headcount": 20, "ai_related": True},
            ],
        ),
    }

    dashboard = build_dashboard("run_low_coverage", results, [])
    signal = dashboard.occupation_signals[0]

    assert signal.ai_entry_opportunity_rate is None
    assert signal.ai_entry_opportunity_status == "LOW_AI_MAPPING_COVERAGE"
    assert signal.ai_subsample_mapping_coverage == 0.0
    assert signal.data_confidence == "LOW"
    assert signal.structural_exposure_score == pytest.approx(24.5, abs=0.1)
    assert signal.score_status == "EXPERIMENTAL"
