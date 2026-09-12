from __future__ import annotations

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
                {"occupation_code": "2", "entry_level": True, "headcount": 2, "ai_related": True},
                {"occupation_code": "4", "entry_level": True, "headcount": 8, "ai_related": False},
            ],
        ),
        "job104_research": AdapterResult(snapshot("job104_research", 0), []),
    }

    dashboard = build_dashboard("run_test", results, [])

    professional = next(item for item in dashboard.occupation_signals if item.code == "2")
    clerical = next(item for item in dashboard.occupation_signals if item.code == "4")
    assert professional.youth_employment_share == 0.3
    assert clerical.youth_employment_share == 0.7
    assert professional.ai_entry_opportunity_rate == 1.0
    assert clerical.ai_entry_opportunity_rate == 0.0
    assert dashboard.summary_metrics["youth_employed_20_24"] == 100
    assert dashboard.summary_metrics["youth_employed_25_29"] == 100
    assert dashboard.cleaning_summary.crosswalk_coverage == 1.0
