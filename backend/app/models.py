from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


def utc_now() -> datetime:
    return datetime.now(UTC)


class FreshnessStatus(StrEnum):
    LIVE = "LIVE"
    UNCHANGED = "UNCHANGED"
    CACHED = "CACHED"
    STALE = "STALE"
    VERSIONED = "VERSIONED"
    FAILED = "FAILED"


class RunStatus(StrEnum):
    QUEUED = "QUEUED"
    FETCHING = "FETCHING"
    INSPECTING = "INSPECTING"
    NORMALIZING = "NORMALIZING"
    JOINING = "JOINING"
    VALIDATING = "VALIDATING"
    PUBLISHING = "PUBLISHING"
    SUCCEEDED = "SUCCEEDED"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"


class SourceSnapshot(BaseModel):
    source_id: str
    status: FreshnessStatus
    source_url: str
    dataset_name: str | None = None
    reference_url: str | None = None
    processing_steps: list[str] = Field(default_factory=list)
    fields_used: list[str] = Field(default_factory=list)
    why_used: str | None = None
    limitations: str | None = None
    input_count_label: str = "records received"
    output_count_label: str = "records prepared"
    retrieved_at: datetime
    source_published_at: datetime | None = None
    http_status: int | None = None
    content_type: str | None = None
    content_sha256: str | None = None
    raw_rows: int = 0
    normalized_rows: int = 0
    message: str | None = None
    snapshot_key: str | None = None


class CleaningAudit(BaseModel):
    duplicates_removed: int = 0
    expired_removed: int = 0
    missing_occupation: int = 0
    crosswalk_coverage: float | None = None
    unmatched_categories: list[str] = Field(default_factory=list)
    transform_version: str = "2026-09-12.2"
    before_after: list[dict[str, Any]] = Field(default_factory=list)


class OccupationSignal(BaseModel):
    code: str
    name: str
    youth_employed: int | None = None
    youth_employed_25_29: int | None = None
    youth_employment_share: float | None = None
    exposure_level: str
    exposure_score: float | None = None
    ai_entry_jobs: int
    total_entry_jobs: int
    ai_entry_opportunity_rate: float | None = None
    priority: Literal["high", "medium", "monitor"]
    source_snapshot_ids: list[str]


class EvidenceItem(BaseModel):
    evidence_id: str
    title: str
    institution: str
    authors: list[str] = Field(default_factory=list)
    published_at: str | None = None
    evidence_type: str
    authority_tier: Literal["A", "B", "C", "D"] = "B"
    method_summary: str | None = None
    finding: str | None = None
    policy_relevance: list[str] = Field(default_factory=list)
    limitations: str | None = None
    doi: str | None = None
    url: HttpUrl
    retrieved_at: datetime
    freshness: FreshnessStatus


class DashboardResponse(BaseModel):
    contract_version: str = "1.0"
    analysis_run_id: str
    published_at: datetime
    overall_status: FreshnessStatus
    sources: list[SourceSnapshot]
    summary_metrics: dict[str, Any]
    occupation_signals: list[OccupationSignal]
    public_opinion: list[dict[str, Any]]
    industry_context: list[dict[str, Any]]
    cleaning_summary: CleaningAudit
    evidence_preview: list[EvidenceItem]
    policy_options: list[dict[str, Any]] | None = None


class RefreshRequest(BaseModel):
    force: bool = True
    sources: list[str] | None = None


class RefreshResponse(BaseModel):
    run_id: str
    status: RunStatus
    poll_url: str


class RunResponse(BaseModel):
    run_id: str
    trigger: Literal["manual", "scheduled", "test"] = "manual"
    status: RunStatus
    started_at: datetime
    finished_at: datetime | None = None
    sources: list[SourceSnapshot] = Field(default_factory=list)
    error: str | None = None


class EvidenceSearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=180)
    occupation_code: str | None = None
    limit: int = Field(default=8, ge=1, le=12)
    force_live: bool = True


class PolicyRequest(BaseModel):
    analysis_run_id: str
    occupation_code: str
    policy_goal: str = Field(min_length=3, max_length=200)
    evidence_ids: list[str] = Field(min_length=1, max_length=8)

    @field_validator("evidence_ids")
    @classmethod
    def unique_evidence_ids(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("evidence_ids must be unique")
        return value


class PolicyOption(BaseModel):
    title: str
    target_group: str
    problem: str
    mechanism: str
    implementation: list[str]
    kpis: list[dict[str, str]]
    evidence_ids: list[str]
    risks: list[str]
    limitations: list[str]


class PolicyResponse(BaseModel):
    generated_at: datetime = Field(default_factory=utc_now)
    model_id: str
    analysis_run_id: str
    options: list[PolicyOption]
    warnings: list[str] = Field(default_factory=list)
    is_fixture: bool = False

    @field_validator("options")
    @classmethod
    def exactly_three_options(cls, value: list[PolicyOption]) -> list[PolicyOption]:
        if len(value) != 3:
            raise ValueError("exactly three policy options are required")
        return value


class ApiError(BaseModel):
    code: str
    message: str
    retryable: bool
    source_id: str | None = None
    run_id: str | None = None
