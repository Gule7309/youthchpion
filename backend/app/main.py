from __future__ import annotations

import asyncio
import json
from typing import Any

import boto3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.evidence import EvidenceService
from app.http import RetryingHttpClient
from app.models import (
    DashboardResponse,
    EvidenceItem,
    EvidenceSearchRequest,
    PolicyRequest,
    PolicyResponse,
    RefreshRequest,
    RefreshResponse,
    RunResponse,
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

store = create_store()
evidence_service = EvidenceService(RetryingHttpClient())
pipeline = PipelineService(store, evidence_service)
policy_service = BedrockPolicyService()
running_tasks: set[asyncio.Task[None]] = set()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, Any]:
    dashboard = pipeline.latest_dashboard()
    checks = {
        "published_dashboard": dashboard is not None,
        "bedrock_model_configured": bool(settings.bedrock_model_id),
        "snapshot_store": "s3" if settings.data_bucket else "local",
        "aws_region": settings.aws_region,
    }
    return {"ready": checks["published_dashboard"], "checks": checks}


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
async def dashboard() -> DashboardResponse:
    latest = pipeline.latest_dashboard()
    if not latest:
        raise HTTPException(status_code=404, detail="dashboard_not_ready")
    return latest


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
        return await evidence_service.search(request.query, request.limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"evidence_search_failed: {exc}") from exc


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
        for item in latest.evidence_preview:
            evidence_service.items.setdefault(item.evidence_id, item)
        evidence = evidence_service.resolve(request.evidence_ids)
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"unknown_evidence_ids: {exc}") from exc
    try:
        response = await policy_service.generate(
            latest.analysis_run_id, signal, request.policy_goal, evidence
        )
    except PolicyGenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    store.put_json(
        f"published/{latest.analysis_run_id}/policy-options.json",
        response.model_dump(mode="json"),
    )
    return response


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
