from datetime import UTC, datetime

from app.main import dashboard_quality_checks
from app.models import (
    CleaningAudit,
    DashboardResponse,
    FreshnessStatus,
    OccupationSignal,
    SourceSnapshot,
)

NOW = datetime(2026, 9, 12, tzinfo=UTC)


def dashboard(dgbas_period: str = "2025") -> DashboardResponse:
    sources = [
        SourceSnapshot(
            source_id=source_id,
            status=FreshnessStatus.LIVE,
            source_url=f"https://example.com/{source_id}",
            data_period=period,
            retrieved_at=NOW,
        )
        for source_id, period in (
            ("dgbas_employment", dgbas_period),
            ("ilo_genai_exposure", None),
            ("mol_vacancy_history", "2025"),
        )
    ]
    signal = OccupationSignal(
        code="4",
        name="事務支援人員",
        youth_employment_share=0.06,
        exposure_level="Moderate",
        exposure_score=0.5,
        ai_entry_jobs=3,
        total_entry_jobs=100,
        recruitment_weakening=0.4,
        structural_exposure_score=17.3,
        score_status="EXPERIMENTAL",
        priority="high",
        source_snapshot_ids=[source.source_id for source in sources],
    )
    return DashboardResponse(
        analysis_run_id="run_ready",
        published_at=NOW,
        overall_status=FreshnessStatus.LIVE,
        sources=sources,
        summary_metrics={
            "ai_subsample_mapping_coverage": 0.95,
            "d_minimum_ai_mapping_coverage": 0.8,
        },
        occupation_signals=[signal],
        public_opinion=[],
        industry_context=[],
        cleaning_summary=CleaningAudit(),
        evidence_preview=[],
    )


def test_readiness_reports_policy_attention_index() -> None:
    checks = dashboard_quality_checks(dashboard(), now=NOW)

    assert checks["dgbas_period_current"] is True
    assert checks["required_indicator_coverage"] is True
    assert checks["taiwanjobs_ai_mapping_coverage"] is True
    assert checks["exact_18_35_ready"] is False
    assert checks["policy_attention_ready"] is True


def test_readiness_rejects_outdated_annual_employment_period() -> None:
    checks = dashboard_quality_checks(dashboard("2024"), now=NOW)

    assert checks["dgbas_period_current"] is False


def test_previous_missing_c_snapshot_remains_readable_during_deployment() -> None:
    value = dashboard().model_dump(mode="json")
    value["occupation_signals"][0]["score_status"] = "MISSING_C"
    value["occupation_signals"][0]["complete_risk_score"] = None

    restored = DashboardResponse.model_validate(value)

    assert restored.occupation_signals[0].structural_exposure_score == 17.3
