from __future__ import annotations

import asyncio
import math
import uuid
from collections import Counter, defaultdict
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
from app.sources.moda_public_opinion import ModaPublicOpinionAdapter
from app.sources.taiwanjobs import TaiwanJobsAdapter
from app.sources.vacancy_history import VacancyHistoryAdapter
from app.storage import SnapshotStore

MIN_ENTRY_HEADCOUNT_FOR_D = 30
MIN_AI_SUBSAMPLE_MAPPING_COVERAGE = 0.8


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
        level_counts: Counter[str] = Counter()
        high_exposure_count = 0.0
        for record in combined:
            record_count = int(record["occupation_count"])
            distribution = record.get("exposure_level_distribution") or {
                str(record["exposure_level"]): record_count
            }
            level_counts.update({str(key): int(value) for key, value in distribution.items()})
            high_exposure_count += (
                float(record.get("high_exposure_occupation_share") or 0) * record_count
            )
        modal_level = sorted(
            level_counts.items(), key=lambda item: (-item[1], item[0])
        )[0][0]
        by_code["7-9"] = {
            "code": "7-9",
            "exposure_score": round(score, 4),
            "exposure_p90": None,
            "exposure_level": modal_level,
            "exposure_level_distribution": dict(level_counts),
            "high_exposure_occupation_share": round(high_exposure_count / count, 4),
            "occupation_count": count,
            "weighting": "unweighted detailed ISCO occupations across major groups 7–9",
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
    vacancy_result = results.get("mol_vacancy_history")
    vacancies = (
        {str(record["code"]): record for record in vacancy_result.records}
        if vacancy_result
        else {}
    )
    grouped_jobs: dict[str, dict[str, int]] = defaultdict(lambda: {"ai": 0, "total": 0})
    matched_jobs = 0
    ai_entry_headcount = 0
    mapped_ai_entry_headcount = 0
    if jobs:
        for job in jobs.records:
            is_quality_entry = job.get(
                "quality_entry", job.get("entry_level") is True
            )
            if not is_quality_entry:
                continue
            headcount = max(int(job["headcount"]), 1)
            if job["ai_related"]:
                ai_entry_headcount += headcount
            code = job.get("occupation_code")
            if not code:
                continue
            matched_jobs += 1
            grouped_jobs[code]["total"] += headcount
            if job["ai_related"]:
                grouped_jobs[code]["ai"] += headcount
                mapped_ai_entry_headcount += headcount
    ai_mapping_coverage = (
        mapped_ai_entry_headcount / ai_entry_headcount if ai_entry_headcount else None
    )

    youth_total = sum(int(record["youth_employed_20_24"]) for record in dgbas.records)
    youth_total_25_29 = sum(int(record["youth_employed_25_29"]) for record in dgbas.records)
    intermediate: list[dict[str, Any]] = []
    for record in dgbas.records:
        code = str(record["code"])
        exposure = ilo.get(code)
        if not exposure:
            continue
        occupation_share_of_youth = (
            record["youth_employed_20_24"] / youth_total if youth_total else None
        )
        youth_share_within_occupation = (
            record["youth_employed_20_24"] / record["total_employed"]
            if record.get("total_employed")
            else None
        )
        counts = grouped_jobs[code]
        raw_opportunity = counts["ai"] / counts["total"] if counts["total"] else None
        if not counts["total"]:
            opportunity = None
            opportunity_status = "NO_DENOMINATOR"
        elif counts["total"] < MIN_ENTRY_HEADCOUNT_FOR_D:
            opportunity = None
            opportunity_status = "LOW_SAMPLE"
        elif ai_mapping_coverage is not None and (
            ai_mapping_coverage < MIN_AI_SUBSAMPLE_MAPPING_COVERAGE
        ):
            opportunity = None
            opportunity_status = "LOW_AI_MAPPING_COVERAGE"
        else:
            opportunity = raw_opportunity
            opportunity_status = "READY_EXPERIMENTAL"
        vacancy = vacancies.get(code, {})
        intermediate.append(
            {
                **record,
                "youth_employment_share": youth_share_within_occupation,
                "occupation_share_of_youth": occupation_share_of_youth,
                "exposure_score": float(exposure["exposure_score"]),
                "exposure_level": str(exposure["exposure_level"]),
                "exposure_p90": exposure.get("exposure_p90"),
                "high_exposure_occupation_share": exposure.get(
                    "high_exposure_occupation_share"
                ),
                "exposure_occupation_count": exposure.get("occupation_count"),
                "ai_entry_jobs": counts["ai"],
                "total_entry_jobs": counts["total"],
                "ai_entry_opportunity_rate": opportunity,
                "ai_entry_opportunity_status": opportunity_status,
                "recruitment_vacancies_current": vacancy.get("new_vacancies"),
                "recruitment_vacancies_previous": vacancy.get(
                    "previous_new_vacancies"
                ),
                "recruitment_yoy_change": vacancy.get("yoy_change"),
                "recruitment_three_year_change": vacancy.get("three_year_change"),
                "recruitment_weakening": vacancy.get("recruitment_weakening"),
                "weakening_sensitivity": vacancy.get("weakening_sensitivity", {}),
                "load": occupation_share_of_youth * float(exposure["exposure_score"])
                if occupation_share_of_youth is not None
                else 0,
            }
        )

    load_high = _percentile([row["load"] for row in intermediate], 0.67)
    for row in intermediate:
        structural_score = (
            100 * math.sqrt(float(row["youth_employment_share"]) * float(row["exposure_score"]))
            if row["youth_employment_share"] is not None
            else None
        )
        row["youth_concentration_index"] = None
        row["opportunity_gap"] = None
        row["transformation_priority_score"] = structural_score
        row["structural_exposure_score"] = structural_score
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
        confidence_reasons = [
            "B 為 ILO 細職業無台灣就業權重的職業大類 proxy",
            "C 尚未取得可靠的職業層級實值，完整 Risk 不發布",
        ]
        data_confidence = "MEDIUM"
        if row["recruitment_weakening"] is None:
            data_confidence = "LOW"
            confidence_reasons.append("H 缺少可比的官方求才序列")
        if row["ai_entry_opportunity_status"] != "READY_EXPERIMENTAL":
            data_confidence = "LOW"
            confidence_reasons.append(
                f"D 未通過品質閘門：{row['ai_entry_opportunity_status']}"
            )
        snapshot_ids = ["dgbas_employment", "ilo_genai_exposure"]
        if vacancy_result:
            snapshot_ids.append("mol_vacancy_history")
        if jobs:
            snapshot_ids.append("taiwanjobs")
        source_refs = [
            {
                "source_id": source_id,
                "run_id": run_id,
                "snapshot_key": results[source_id].snapshot.snapshot_key,
                "content_sha256": results[source_id].snapshot.content_sha256,
                "data_period": results[source_id].snapshot.data_period,
            }
            for source_id in snapshot_ids
            if source_id in results
        ]
        signals.append(
            OccupationSignal(
                code=row["code"],
                name=row["name"],
                youth_employed=row["youth_employed"],
                youth_employed_25_29=row["youth_employed_25_29"],
                youth_employment_share=(
                    round(row["youth_employment_share"], 4)
                    if row["youth_employment_share"] is not None
                    else None
                ),
                occupation_share_of_youth=(
                    round(row["occupation_share_of_youth"], 4)
                    if row["occupation_share_of_youth"] is not None
                    else None
                ),
                exposure_level=row["exposure_level"],
                exposure_score=row["exposure_score"],
                exposure_p90=row["exposure_p90"],
                high_exposure_occupation_share=row[
                    "high_exposure_occupation_share"
                ],
                exposure_occupation_count=row["exposure_occupation_count"],
                ai_entry_jobs=row["ai_entry_jobs"],
                total_entry_jobs=row["total_entry_jobs"],
                ai_entry_opportunity_rate=(
                    round(opportunity, 4) if opportunity is not None else None
                ),
                ai_entry_opportunity_status=row["ai_entry_opportunity_status"],
                ai_subsample_mapping_coverage=(
                    round(ai_mapping_coverage, 4)
                    if ai_mapping_coverage is not None
                    else None
                ),
                recruitment_vacancies_current=row["recruitment_vacancies_current"],
                recruitment_vacancies_previous=row["recruitment_vacancies_previous"],
                recruitment_yoy_change=row["recruitment_yoy_change"],
                recruitment_three_year_change=row["recruitment_three_year_change"],
                recruitment_weakening=row["recruitment_weakening"],
                weakening_sensitivity=row["weakening_sensitivity"],
                transformation_priority_score=(
                    round(row["transformation_priority_score"], 1)
                    if row["transformation_priority_score"] is not None
                    else None
                ),
                structural_exposure_score=(
                    round(row["structural_exposure_score"], 1)
                    if row["structural_exposure_score"] is not None
                    else None
                ),
                complete_risk_score=None,
                score_status="MISSING_C",
                data_confidence=data_confidence,
                data_confidence_reasons=confidence_reasons,
                priority=priority,
                source_snapshot_ids=snapshot_ids,
                source_snapshot_refs=source_refs,
            )
        )

    source_snapshots = [result.snapshot for result in results.values()]
    partial = any(snapshot.status == FreshnessStatus.FAILED for snapshot in source_snapshots)
    audit = jobs.audit if jobs else {}
    coverage_denominator = sum(
        1
        for job in jobs.records
        if job.get("quality_entry", job.get("entry_level") is True)
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
            {
                "before": "MOL annual nine occupation groups",
                "after": "seven-group comparable H series",
            },
            {"before": "MODA official PDF tables", "after": "cross-validated youth opinion series"},
        ],
    )
    industry_context = (
        results.get("job104_research").records
        if results.get("job104_research")
        else []
    )
    public_opinion = (
        results.get("moda_public_opinion").records
        if results.get("moda_public_opinion")
        else []
    )
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
            "ai_subsample_mapping_coverage": (
                round(ai_mapping_coverage, 4)
                if ai_mapping_coverage is not None
                else None
            ),
            "d_minimum_entry_headcount": MIN_ENTRY_HEADCOUNT_FOR_D,
            "d_minimum_ai_mapping_coverage": MIN_AI_SUBSAMPLE_MAPPING_COVERAGE,
            "high_priority_occupations": sum(signal.priority == "high" for signal in signals),
            "thresholds": {
                "load_p67": round(load_high, 4),
                "priority_score_p67": round(priority_high, 1),
                "priority_score_p33": round(priority_medium, 1),
            },
            "metric_warning": (
                "目前只發布實驗性結構暴露：A=職業內 20–24 歲青年占比，"
                "B=ILO 職業任務暴露 proxy。P=該職業占全部青年就業比率、"
                "H=勞動部官方求才年減形成的獨立招募弱化訊號、D=AI 初階職缺機會率，"
                "均分開顯示。C 尚無可靠職業量化值，所以完整 Risk 為 null。"
            ),
            "score_formula": "100 × sqrt(A × B); experimental structural exposure only",
            "risk_formula_candidate": "Risk requires calibrated A, B, C and independent H",
            "risk_status": "MISSING_C",
            "score_version": "2026-09-12.3",
        },
        occupation_signals=signals,
        public_opinion=public_opinion,
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
            VacancyHistoryAdapter(RetryingHttpClient()),
            ModaPublicOpinionAdapter(RetryingHttpClient()),
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
            if result.raw_artifacts:
                manifest = []
                for artifact in result.raw_artifacts:
                    extension = self._extension(artifact.content_type)
                    raw_key = (
                        f"raw/{run_id}/{result.snapshot.source_id}/"
                        f"{artifact.name}.{extension}"
                    )
                    self.store.put_bytes(raw_key, artifact.body, artifact.content_type)
                    manifest.append(
                        {
                            "name": artifact.name,
                            "url": artifact.url,
                            "snapshot_key": raw_key,
                            "content_sha256": artifact.content_sha256,
                        }
                    )
                manifest_key = f"raw/{run_id}/{result.snapshot.source_id}/manifest.json"
                self.store.put_json(manifest_key, {"artifacts": manifest})
                result.snapshot.snapshot_key = manifest_key
            elif result.raw_body is not None:
                extension = self._extension(result.snapshot.content_type)
                raw_key = f"raw/{run_id}/{result.snapshot.source_id}.{extension}"
                self.store.put_bytes(
                    raw_key, result.raw_body, result.snapshot.content_type or ""
                )
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
