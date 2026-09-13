from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.evidence import EvidenceService
from app.evidence_agent import AuthorityEvidenceAgent, EvidenceAgentError
from app.http import RetryingHttpClient
from app.models import (
    DashboardResponse,
    EvidenceItem,
    EvidenceSearchRequest,
    EvidenceVerificationRequest,
    EvidenceVerificationResponse,
    FreshnessStatus,
    PolicyRequest,
    PolicyResponse,
    RefreshRequest,
    RefreshResponse,
    RunResponse,
    VerifiedClaim,
)
from app.pipeline import PipelineService
from app.policy import BedrockPolicyService, PolicyGenerationError
from app.storage import create_store

app = FastAPI(title="Youth Champion API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def cache_control_for(method: str, path: str, status_code: int) -> str:
    if method != "GET" or status_code >= 400:
        return "no-store"
    if path.startswith("/assets/"):
        return "public, max-age=31536000, immutable"
    if path == "/" or path.endswith("/index.html"):
        return "no-cache"
    if path == "/v1/dashboard" or path.startswith("/v1/occupations/"):
        return "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    if path.startswith("/v1/dashboard/"):
        return "no-cache"
    return "no-store"


@app.middleware("http")
async def add_cache_policy(request: Request, call_next: Any) -> Response:
    response = await call_next(request)
    response.headers.setdefault(
        "Cache-Control",
        cache_control_for(request.method, request.url.path, response.status_code),
    )
    return response

store = create_store()
evidence_service = EvidenceService(RetryingHttpClient())
pipeline = PipelineService(store, evidence_service)
policy_service = BedrockPolicyService()
authority_agent = AuthorityEvidenceAgent()
running_tasks: set[asyncio.Task[None]] = set()


def dashboard_quality_checks(
    dashboard: DashboardResponse | None,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    if dashboard is None:
        return {
            "published_dashboard": False,
            "dashboard_recent": False,
            "required_sources_usable": False,
            "dgbas_period_current": False,
            "vacancy_period_current": False,
            "required_indicator_coverage": False,
            "taiwanjobs_ai_mapping_coverage": False,
            "exact_18_35_ready": False,
            "complete_risk_ready": False,
        }
    sources = {source.source_id: source for source in dashboard.sources}
    usable = {FreshnessStatus.LIVE, FreshnessStatus.UNCHANGED, FreshnessStatus.CACHED}
    required_ids = {"dgbas_employment", "ilo_genai_exposure", "mol_vacancy_history"}

    def current_period(source_id: str) -> bool:
        value = sources.get(source_id)
        if value is None or value.data_period is None:
            return False
        try:
            return int(value.data_period) >= now.year - 1
        except ValueError:
            return False

    mapping_coverage = dashboard.summary_metrics.get("ai_subsample_mapping_coverage")
    minimum_mapping = dashboard.summary_metrics.get(
        "d_minimum_ai_mapping_coverage", 0.8
    )
    return {
        "published_dashboard": True,
        "dashboard_recent": now - dashboard.published_at <= timedelta(
            hours=settings.latest_max_stale_hours
        ),
        "required_sources_usable": all(
            source_id in sources and sources[source_id].status in usable
            for source_id in required_ids
        ),
        "dgbas_period_current": current_period("dgbas_employment"),
        "vacancy_period_current": current_period("mol_vacancy_history"),
        "required_indicator_coverage": bool(dashboard.occupation_signals)
        and all(
            signal.youth_employment_share is not None
            and signal.exposure_score is not None
            and signal.recruitment_weakening is not None
            for signal in dashboard.occupation_signals
        ),
        "taiwanjobs_ai_mapping_coverage": isinstance(mapping_coverage, (int, float))
        and float(mapping_coverage) >= float(minimum_mapping),
        "exact_18_35_ready": (
            dashboard.summary_metrics.get("analysis_population_exact") is True
            and dashboard.summary_metrics.get("analysis_population_source_id")
            == "dgbas_microdata_18_35"
        ),
        "complete_risk_ready": bool(dashboard.occupation_signals)
        and all(
            signal.complete_risk_score is not None
            for signal in dashboard.occupation_signals
        ),
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, Any]:
    dashboard = pipeline.latest_dashboard()
    checks = {
        **dashboard_quality_checks(dashboard),
        "bedrock_model_configured": bool(settings.bedrock_model_id),
        "snapshot_store": "s3" if settings.data_bucket else "local",
        "aws_region": settings.aws_region,
    }
    core_checks = (
        "published_dashboard",
        "dashboard_recent",
        "required_sources_usable",
        "dgbas_period_current",
        "vacancy_period_current",
        "required_indicator_coverage",
        "taiwanjobs_ai_mapping_coverage",
    )
    return {
        "ready": all(checks[name] for name in core_checks),
        "policy_generation_ready": checks["bedrock_model_configured"],
        "complete_risk_ready": checks["complete_risk_ready"],
        "checks": checks,
    }


@app.post("/v1/refresh", response_model=RefreshResponse, status_code=202)
async def refresh(request: RefreshRequest) -> RefreshResponse:
    del request
    run = pipeline.create_run()
    if settings.ingestion_function_name:
        client = boto3.client("lambda", region_name=settings.aws_region)
        await asyncio.to_thread(
            client.invoke,
            FunctionName=settings.ingestion_function_name,
            InvocationType="Event",
            Payload=json.dumps({"action": "refresh", "run_id": run.run_id}).encode(),
        )
    else:
        task = asyncio.create_task(pipeline.execute(run.run_id))
        running_tasks.add(task)
        task.add_done_callback(running_tasks.discard)
    return RefreshResponse(
        run_id=run.run_id,
        status=run.status,
        poll_url=f"/v1/runs/{run.run_id}",
    )


@app.get("/v1/runs/{run_id}", response_model=RunResponse)
async def get_run(run_id: str) -> RunResponse:
    run = pipeline.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run_not_found")
    return run


@app.get("/v1/dashboard", response_model=DashboardResponse)
async def dashboard(request: Request, response: Response) -> Any:
    latest = pipeline.latest_dashboard()
    if not latest:
        raise HTTPException(status_code=404, detail="dashboard_not_ready")
    is_stale = datetime.now(UTC) - latest.published_at > timedelta(
        hours=settings.latest_max_stale_hours
    )
    if is_stale:
        latest = latest.model_copy(update={"overall_status": FreshnessStatus.STALE})
        response.headers["Cache-Control"] = "no-cache"
    etag = (
        f'"dashboard-{latest.analysis_run_id}-'
        f'{latest.overall_status.value.casefold()}"'
    )
    if request.headers.get("if-none-match") == etag:
        headers = {"ETag": etag}
        if is_stale:
            headers["Cache-Control"] = "no-cache"
        return Response(status_code=304, headers=headers)
    response.headers["ETag"] = etag
    return latest


@app.get("/v1/dashboard/{run_id}", response_model=DashboardResponse)
async def versioned_dashboard(run_id: str, request: Request, response: Response) -> Any:
    stored = store.get_json(f"published/{run_id}/dashboard.json")
    if not stored:
        raise HTTPException(status_code=404, detail="dashboard_run_not_found")
    value = DashboardResponse.model_validate(stored)
    if value.analysis_run_id != run_id:
        raise HTTPException(status_code=409, detail="dashboard_run_mismatch")
    representation = json.dumps(
        value.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    content_hash = hashlib.sha256(representation.encode()).hexdigest()[:16]
    etag = f'"dashboard-{run_id}-{content_hash}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    response.headers["ETag"] = etag
    return value


@app.get("/v1/occupations/{code}")
async def occupation(code: str) -> dict[str, Any]:
    latest = pipeline.latest_dashboard()
    if not latest:
        raise HTTPException(status_code=404, detail="dashboard_not_ready")
    signal = next((item for item in latest.occupation_signals if item.code == code), None)
    if not signal:
        raise HTTPException(status_code=404, detail="occupation_not_found")
    return {
        "analysis_run_id": latest.analysis_run_id,
        "signal": signal,
        "sources": [
            source
            for source in latest.sources
            if source.source_id in signal.source_snapshot_ids
        ],
    }


@app.post("/v1/evidence/search", response_model=list[EvidenceItem])
async def search_evidence(request: EvidenceSearchRequest) -> list[EvidenceItem]:
    try:
        items = await evidence_service.search(request.query, request.limit)
        for item in items:
            store.put_json(
                f"evidence/items/{item.evidence_id}.json",
                item.model_dump(mode="json"),
            )
        return items
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"evidence_search_failed: {exc}") from exc


def _resolve_evidence(ids: list[str]) -> list[EvidenceItem]:
    latest = pipeline.latest_dashboard()
    if latest:
        for item in latest.evidence_preview:
            evidence_service.items.setdefault(item.evidence_id, item)
    for evidence_id in ids:
        if evidence_id in evidence_service.items:
            continue
        stored = store.get_json(f"evidence/items/{evidence_id}.json")
        if stored:
            evidence_service.items[evidence_id] = EvidenceItem.model_validate(stored)
    return evidence_service.resolve(ids)


@app.post("/v1/evidence/verify", response_model=EvidenceVerificationResponse)
async def verify_evidence(
    request: EvidenceVerificationRequest,
) -> EvidenceVerificationResponse:
    latest = pipeline.latest_dashboard()
    if not latest or latest.analysis_run_id != request.analysis_run_id:
        raise HTTPException(status_code=409, detail="analysis_run_is_not_latest")
    signal = (
        next(
            (
                item
                for item in latest.occupation_signals
                if item.code == request.occupation_code
            ),
            None,
        )
        if request.occupation_code
        else (latest.occupation_signals[0] if latest.occupation_signals else None)
    )
    if request.occupation_code and signal is None:
        raise HTTPException(status_code=404, detail="occupation_not_found")
    usable = {FreshnessStatus.LIVE, FreshnessStatus.UNCHANGED, FreshnessStatus.CACHED}
    local_source_ids = [
        source.source_id
        for source in latest.sources
        if source.status in usable
        and source.source_id
        in {
            "dgbas_employment",
            "mol_vacancy_history",
            "taiwanjobs",
            "moda_public_opinion",
        }
    ]
    try:
        response = await authority_agent.research(
            request.analysis_run_id,
            request.search_query,
            request.question,
            evidence_service.search,
            request.evidence_ids,
            local_context={
                "occupation_code": signal.code if signal else request.occupation_code,
                "occupation_name": signal.name if signal else None,
                "source_ids": local_source_ids,
            },
        )
        for item in response.searched_candidates:
            store.put_json(
                f"evidence/items/{item.evidence_id}.json",
                item.model_dump(mode="json"),
            )
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"unknown_evidence_ids: {exc}") from exc
    except EvidenceAgentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    store.put_json(
        f"evidence/verifications/{response.verification_id}.json",
        response.model_dump(mode="json"),
    )
    return response


@app.post("/v1/policy-options", response_model=PolicyResponse)
async def policy_options(request: PolicyRequest) -> PolicyResponse:
    latest = pipeline.latest_dashboard()
    if not latest or latest.analysis_run_id != request.analysis_run_id:
        raise HTTPException(status_code=409, detail="analysis_run_is_not_latest")
    signal = next(
        (item for item in latest.occupation_signals if item.code == request.occupation_code),
        None,
    )
    if not signal:
        raise HTTPException(status_code=404, detail="occupation_not_found")
    try:
        verification_raw = store.get_json(
            f"evidence/verifications/{request.verification_id}.json"
        )
        if not verification_raw:
            raise HTTPException(status_code=422, detail="evidence_verification_not_found")
        verification = EvidenceVerificationResponse.model_validate(verification_raw)
        if verification.analysis_run_id != request.analysis_run_id:
            raise HTTPException(status_code=409, detail="evidence_verification_is_not_latest")
        if not set(request.evidence_ids).issubset(verification.approved_evidence_ids):
            raise HTTPException(status_code=422, detail="evidence_not_approved_by_agent")
        evidence = _resolve_evidence(request.evidence_ids)
        verified_claims = [
            claim
            for claim in verification.claims
            if claim.evidence_id in request.evidence_ids
        ]
        if not _has_complete_verification_receipts(
            verified_claims, request.evidence_ids
        ):
            raise HTTPException(
                status_code=422,
                detail="evidence_verification_receipt_missing",
            )
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"unknown_evidence_ids: {exc}") from exc
    try:
        response = await policy_service.generate(
            latest.analysis_run_id,
            signal,
            request.policy_goal,
            evidence,
            verified_claims,
            verification.taiwan_applicability,
        )
    except PolicyGenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    store.put_json(
        (
            f"published/{latest.analysis_run_id}/policy-options/"
            f"{request.occupation_code}-{_policy_artifact_id(request)}.json"
        ),
        response.model_dump(mode="json"),
    )
    return response


def _has_complete_verification_receipts(
    claims: list[VerifiedClaim], evidence_ids: list[str]
) -> bool:
    expected = set(evidence_ids)
    covered = {claim.evidence_id for claim in claims}
    return bool(expected) and expected.issubset(covered) and all(
        claim.retrieved_url is not None
        and claim.content_sha256 is not None
        and bool(claim.authority_basis and claim.authority_basis.strip())
        for claim in claims
    )


def _policy_artifact_id(request: PolicyRequest) -> str:
    identity = json.dumps(
        {
            "occupation_code": request.occupation_code,
            "policy_goal": " ".join(request.policy_goal.casefold().split()),
            "evidence_ids": sorted(request.evidence_ids),
            "verification_id": request.verification_id,
            "model_id": settings.bedrock_model_id,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(identity.encode()).hexdigest()[:16]


# A production build can be served by the same process. API routes are registered first,
# so the SPA fallback never shadows them.
from pathlib import Path  # noqa: E402

from fastapi.staticfiles import StaticFiles  # noqa: E402

frontend_candidates = (
    Path(__file__).resolve().parents[1] / "frontend" / "dist",  # Lambda zip
    Path(__file__).resolve().parents[2] / "frontend" / "dist",  # repository
)
frontend_dist = next((path for path in frontend_candidates if path.exists()), None)
if frontend_dist:
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
