from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app, cache_control_for
from app.models import CleaningAudit, DashboardResponse, FreshnessStatus


def dashboard(age_hours: int = 0) -> DashboardResponse:
    return DashboardResponse(
        analysis_run_id="run_cache",
        published_at=datetime.now(UTC) - timedelta(hours=age_hours),
        overall_status=FreshnessStatus.LIVE,
        sources=[],
        summary_metrics={},
        occupation_signals=[],
        public_opinion=[],
        industry_context=[],
        cleaning_summary=CleaningAudit(),
        evidence_preview=[],
    )


def test_dashboard_uses_short_shared_cache_and_etag(monkeypatch) -> None:
    monkeypatch.setattr("app.main.pipeline.latest_dashboard", lambda: dashboard())
    client = TestClient(app)

    response = client.get("/v1/dashboard")

    assert response.status_code == 200
    assert response.headers["etag"] == '"dashboard-run_cache-live"'
    assert response.headers["cache-control"] == (
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    )

    unchanged = client.get(
        "/v1/dashboard", headers={"If-None-Match": '"dashboard-run_cache-live"'}
    )
    assert unchanged.status_code == 304
    assert unchanged.content == b""


def test_stale_dashboard_requires_revalidation(monkeypatch) -> None:
    monkeypatch.setattr("app.main.pipeline.latest_dashboard", lambda: dashboard(age_hours=169))

    response = TestClient(app).get("/v1/dashboard")

    assert response.status_code == 200
    assert response.json()["overall_status"] == "STALE"
    assert response.headers["etag"] == '"dashboard-run_cache-stale"'
    assert response.headers["cache-control"] == "no-cache"

    unchanged = TestClient(app).get(
        "/v1/dashboard",
        headers={"If-None-Match": '"dashboard-run_cache-stale"'},
    )
    assert unchanged.status_code == 304
    assert unchanged.headers["cache-control"] == "no-cache"

    old_live_etag = TestClient(app).get(
        "/v1/dashboard",
        headers={"If-None-Match": '"dashboard-run_cache-live"'},
    )
    assert old_live_etag.status_code == 200
    assert old_live_etag.json()["overall_status"] == "STALE"


def test_cache_policy_separates_hashed_assets_from_mutations() -> None:
    assert cache_control_for("GET", "/assets/index-abc123.js", 200) == (
        "public, max-age=31536000, immutable"
    )
    assert cache_control_for("GET", "/index.html", 200) == "no-cache"
    assert cache_control_for("GET", "/v1/dashboard/run_cache", 200) == "no-cache"
    assert cache_control_for("POST", "/v1/evidence/verify", 200) == "no-store"
    assert cache_control_for("GET", "/v1/dashboard", 500) == "no-store"


def test_versioned_dashboard_etag_changes_with_content(monkeypatch) -> None:
    current = dashboard().model_dump(mode="json")
    monkeypatch.setattr("app.main.store.get_json", lambda _: current)
    client = TestClient(app)

    first = client.get("/v1/dashboard/run_cache")
    first_etag = first.headers["etag"]
    assert first.status_code == 200
    assert first.headers["cache-control"] == "no-cache"

    unchanged = client.get(
        "/v1/dashboard/run_cache", headers={"If-None-Match": first_etag}
    )
    assert unchanged.status_code == 304

    current = {
        **current,
        "summary_metrics": {"changed": 1},
    }
    changed = client.get(
        "/v1/dashboard/run_cache", headers={"If-None-Match": first_etag}
    )
    assert changed.status_code == 200
    assert changed.headers["etag"] != first_etag
