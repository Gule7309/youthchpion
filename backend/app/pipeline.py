from __future__ import annotations

import asyncio
import math
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from app.evidence import EvidenceService
from app.http import RetryingHttpClient
from app.models import (
    CleaningAudit,
    DashboardResponse,
    FreshnessStatus,
    OccupationSignal,
    RunResponse,
    RunStatus,
    SourceSnapshot,
)
from app.sources.base import AdapterResult
from app.sources.dgbas import DgbasAdapter
from app.sources.ilo import IloAdapter
from app.sources.job104 import Job104Adapter
from app.sources.taiwanjobs import TaiwanJobsAdapter
from app.storage import SnapshotStore

PUBLIC_OPINION = [
    {
        "label": "20–29歲就業網路族認為工作可能被自動化／AI取代",
        "value": 39.5,
        "unit": "%",
        "survey_year": 2024,
        "source": "數位發展部 113年數位近用調查",
        "url": "https://srda.sinica.edu.tw/file/e0362889-6adc-4857-9908-4319f33548a3",
        "status": "VERSIONED",
        "note": "公眾感受訊號，獨立呈現，不參與客觀指標運算。",
    }
]


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * percentile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def _combined_ilo(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_code = {str(record["code"]): record for record in records}
    combined = [by_code[code] for code in ("7", "8", "9") if code in by_code]
    if combined:
        count = sum(int(record["occupation_count"]) for record in combined)
        score = sum(
            float(record["exposure_score"]) * int(record["occupation_count"])
            for record in combined
        ) / count
        by_code["7-9"] = {
            "code": "7-9",
            "exposure_score": round(score, 4),
            "exposure_level": "Aggregated ILO major groups 7–9",
        }
    return by_code


def build_dashboard(
    run_id: str,
    results: dict[str, AdapterResult],
    evidence_preview: list,
) -> DashboardResponse:
    dgbas = results["dgbas_employment"]
    ilo = _combined_ilo(results["ilo_genai_exposure"].records)
    jobs = results.get("taiwanjobs")
    grouped_jobs: dict[str, dict[str, int]] = defaultdict(lambda: {"ai": 0, "total": 0})
    matched_jobs = 0
    if jobs:
        for job in jobs.records:
            code = job.get("occupation_code")
            if not code or not job["entry_level"]:
                continue
            matched_jobs += 1
            headcount = max(int(job["headcount"]), 1)
            grouped_jobs[code]["total"] += headcount
            if job["ai_related"]:
                grouped_jobs[code]["ai"] += headcount

    youth_total = sum(int(record["youth_employed_20_24"]) for record in dgbas.records)
    youth_total_25_29 = sum(int(record["youth_employed_25_29"]) for record in dgbas.records)
    intermediate: list[dict[str, Any]] = []
    for record in dgbas.records:
        code = str(record["code"])
        exposure = ilo.get(code)
        if not exposure:
            continue
        employment_share = record["youth_employed"] / youth_total if youth_total else None
        counts = grouped_jobs[code]
        opportunity = counts["ai"] / counts["total"] if counts["total"] else None
        intermediate.append(
            {
                **record,
                "youth_employment_share": employment_share,
                "exposure_score": float(exposure["exposure_score"]),
                "exposure_level": str(exposure["exposure_level"]),
                "ai_entry_jobs": counts["ai"],
                "total_entry_jobs": counts["total"],
                "ai_entry_opportunity_rate": opportunity,
                "load": employment_share * float(exposure["exposure_score"])
                if employment_share is not None
                else 0,
            }
        )

    load_high = _percentile([row["load"] for row in intermediate], 0.67)
    max_employment_share = max(
        (float(row["youth_employment_share"] or 0) for row in intermediate),
        default=0,
    )
    for row in intermediate:
        opportunity = row["ai_entry_opportunity_rate"]
        concentration = (
            float(row["youth_employment_share"]) / max_employment_share
            if max_employment_share and row["youth_employment_share"] is not None
            else None
        )
        gap = 1 - float(opportunity) if opportunity is not None else None
        score = (
            100
            * (
                concentration
                * float(row["exposure_score"])
                * gap
            )
            ** (1 / 3)
            if concentration is not None and gap is not None
            else None
        )
        row["youth_concentration_index"] = concentration
        row["opportunity_gap"] = gap
        row["transformation_priority_score"] = score
    opportunity_values = [
        row["ai_entry_opportunity_rate"]
        for row in intermediate
        if row["ai_entry_opportunity_rate"] is not None
    ]
    opportunity_high = _percentile(opportunity_values, 0.67)
    priority_scores = [
        float(row["transformation_priority_score"])
        for row in intermediate
        if row["transformation_priority_score"] is not None
    ]
    priority_high = _percentile(priority_scores, 0.67)
    priority_medium = _percentile(priority_scores, 0.33)
    signals: list[OccupationSignal] = []
    for row in intermediate:
        opportunity = row["ai_entry_opportunity_rate"]
        row_priority_score = row["transformation_priority_score"]
        if row_priority_score is not None and row_priority_score >= priority_high:
            priority = "high"
        elif row_priority_score is not None and row_priority_score >= priority_medium:
            priority = "medium"
        else:
            priority = "monitor"
        snapshot_ids = ["dgbas_employment", "ilo_genai_exposure"]
        if jobs:
            snapshot_ids.append("taiwanjobs")
        signals.append(
            OccupationSignal(
                code=row["code"],
                name=row["name"],
                youth_employed=row["youth_employed"],
                youth_employed_25_29=row["youth_employed_25_29"],
                youth_employment_share=round(row["youth_employment_share"], 4),
                exposure_level=row["exposure_level"],
                exposure_score=row["exposure_score"],
                ai_entry_jobs=row["ai_entry_jobs"],
                total_entry_jobs=row["total_entry_jobs"],
                ai_entry_opportunity_rate=(
                    round(opportunity, 4) if opportunity is not None else None
                ),
                youth_concentration_index=(
                    round(row["youth_concentration_index"], 4)
                    if row["youth_concentration_index"] is not None
                    else None
                ),
                opportunity_gap=(
                    round(row["opportunity_gap"], 4)
                    if row["opportunity_gap"] is not None
                    else None
                ),
                transformation_priority_score=(
                    round(row["transformation_priority_score"], 1)
                    if row["transformation_priority_score"] is not None
                    else None
                ),
                priority=priority,
                source_snapshot_ids=snapshot_ids,
            )
        )

    source_snapshots = [result.snapshot for result in results.values()]
    partial = any(snapshot.status == FreshnessStatus.FAILED for snapshot in source_snapshots)
    audit = jobs.audit if jobs else {}
    coverage_denominator = sum(
        1 for job in jobs.records if job["entry_level"]
    ) if jobs else 0
    cleaning = CleaningAudit(
        duplicates_removed=audit.get("duplicates_removed", 0),
        expired_removed=audit.get("expired_removed", 0),
        missing_occupation=audit.get("missing_occupation", 0),
        crosswalk_coverage=round(matched_jobs / coverage_denominator, 4)
        if coverage_denominator
        else None,
        unmatched_categories=audit.get("unmatched_categories", []),
        before_after=[
            {"before": "DGBAS value (thousand people)", "after": "integer person count"},
            {"before": "DGBAS all published age columns", "after": "20–24 primary; 25–29 context"},
            {"before": "ILO detailed occupations", "after": "ISCO major-group averages"},
            {"before": "TaiwanJobs non-standard XML", "after": "parseable normalized fields"},
            {"before": "TaiwanJobs proprietary category", "after": "versioned occupation group"},
            {"before": "104 search API HTML excerpts", "after": "plain-text industry context"},
        ],
    )
    industry_context = results.get("job104").records if results.get("job104") else []
    return DashboardResponse(
        analysis_run_id=run_id,
        published_at=datetime.now(UTC),
        overall_status=FreshnessStatus.STALE if partial else FreshnessStatus.LIVE,
        sources=source_snapshots,
        summary_metrics={
            "youth_employed_20_24": youth_total,
            "youth_employed_25_29": youth_total_25_29,
            "youth_employed_20_29": youth_total + youth_total_25_29,
            "youth_ai_exposure_load": round(sum(row["load"] for row in intermediate), 4),
            "live_entry_jobs": sum(row["total_entry_jobs"] for row in intermediate),
            "high_priority_occupations": sum(signal.priority == "high" for signal in signals),
            "thresholds": {
                "load_p67": round(load_high, 4),
                "opportunity_p67": round(opportunity_high, 4),
                "priority_score_p67": round(priority_high, 1),
                "priority_score_p33": round(priority_medium, 1),
            },
            "metric_warning": (
                "AI 轉型優先度以 A=20–24 歲就業集中度（本次職類內正規化）、"
                "B=ILO 職業暴露、H=1−即時 AI 初階職缺占比計算。"
                "它是政策排序訊號，不是被取代人數、失業率或因果機率；"
                "產業 AI 導入 C 尚無可比職業量化值，因此不冒充納入分數。"
            ),
            "score_formula": "100 × cubic_root(A × B × H)",
            "score_version": "2026-09-12.1",
        },
        occupation_signals=signals,
        public_opinion=PUBLIC_OPINION,
        industry_context=industry_context,
        cleaning_summary=cleaning,
        evidence_preview=evidence_preview,
    )


class PipelineService:
    def __init__(self, store: SnapshotStore, evidence: EvidenceService) -> None:
        self.store = store
        self.evidence = evidence
        self.runs: dict[str, RunResponse] = {}

    def create_run(self, trigger: str = "manual") -> RunResponse:
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        run = RunResponse(
            run_id=run_id,
            trigger=trigger,
            status=RunStatus.QUEUED,
            started_at=datetime.now(UTC),
        )
        self.runs[run_id] = run
        self._persist_run(run)
        return run

    def get_run(self, run_id: str) -> RunResponse | None:
        if run_id in self.runs:
            return self.runs[run_id]
        stored = self.store.get_json(f"runs/{run_id}.json")
        return RunResponse.model_validate(stored) if stored else None

    async def execute(self, run_id: str) -> None:
        run = self.get_run(run_id)
        if run is None:
            raise KeyError(f"unknown run: {run_id}")
        self.runs[run_id] = run
        run.status = RunStatus.FETCHING
        self._persist_run(run)
        adapters = [
            # DGBAS serves an incomplete TLS chain to Linux clients. This scoped
            # compatibility mode is followed by a strict workbook schema gate.
            DgbasAdapter(RetryingHttpClient(verify=False)),
            IloAdapter(RetryingHttpClient()),
            TaiwanJobsAdapter(RetryingHttpClient()),
            Job104Adapter(RetryingHttpClient()),
        ]
        fetched = await asyncio.gather(
            *(adapter.fetch() for adapter in adapters), return_exceptions=True
        )
        results: dict[str, AdapterResult] = {}
        for adapter, result in zip(adapters, fetched, strict=True):
            if isinstance(result, Exception):
                results[adapter.source_id] = AdapterResult(
                    snapshot=SourceSnapshot(
                        source_id=adapter.source_id,
                        status=FreshnessStatus.FAILED,
                        source_url="unavailable",
                        retrieved_at=datetime.now(UTC),
                        message=str(result),
                    )
                )
                continue
            previous = self._previous_source(result.snapshot.source_id)
            if previous and previous.get("content_sha256") == result.snapshot.content_sha256:
                result.snapshot.status = FreshnessStatus.UNCHANGED
            extension = self._extension(result.snapshot.content_type)
            raw_key = f"raw/{run_id}/{result.snapshot.source_id}.{extension}"
            if result.raw_body is not None:
                self.store.put_bytes(raw_key, result.raw_body, result.snapshot.content_type or "")
                result.snapshot.snapshot_key = raw_key
            normalized_key = f"normalized/{run_id}/{result.snapshot.source_id}.json"
            self.store.put_json(normalized_key, {"records": result.records, "audit": result.audit})
            results[result.snapshot.source_id] = result

        run.status = RunStatus.VALIDATING
        run.sources = [result.snapshot for result in results.values()]
        self._persist_run(run)
        required_missing = any(
            results[source].snapshot.status == FreshnessStatus.FAILED
            for source in ("dgbas_employment", "ilo_genai_exposure")
        )
        if required_missing:
            run.status = RunStatus.FAILED
            run.error = "Required DGBAS or ILO source could not be refreshed."
            run.finished_at = datetime.now(UTC)
            self._persist_run(run)
            return

        evidence: list = []
        try:
            evidence = await self.evidence.search(
                "generative AI labour market youth skills training employment policy", 8
            )
        except Exception:
            pass
        dashboard = build_dashboard(run_id, results, evidence)
        run.status = RunStatus.PUBLISHING
        self._persist_run(run)
        self.store.put_json(f"published/{run_id}/dashboard.json", dashboard.model_dump(mode="json"))
        self.store.put_json("latest/dashboard.json", dashboard.model_dump(mode="json"))
        run.status = (
            RunStatus.PARTIAL
            if any(item.status == FreshnessStatus.FAILED for item in run.sources)
            else RunStatus.SUCCEEDED
        )
        run.finished_at = datetime.now(UTC)
        self._persist_run(run)

    def latest_dashboard(self) -> DashboardResponse | None:
        value = self.store.get_json("latest/dashboard.json")
        return DashboardResponse.model_validate(value) if value else None

    def _persist_run(self, run: RunResponse) -> None:
        self.store.put_json(f"runs/{run.run_id}.json", run.model_dump(mode="json"))

    def _previous_source(self, source_id: str) -> dict[str, Any] | None:
        latest = self.store.get_json("latest/dashboard.json")
        if not latest:
            return None
        return next(
            (
                source
                for source in latest.get("sources", [])
                if source["source_id"] == source_id
            ),
            None,
        )

    @staticmethod
    def _extension(content_type: str | None) -> str:
        content_type = content_type or ""
        if "spreadsheet" in content_type or "excel" in content_type:
            return "xlsx"
        if "xml" in content_type:
            return "xml"
        if "json" in content_type:
            return "json"
        if "csv" in content_type or "octet-stream" in content_type:
            return "csv"
        return "bin"
