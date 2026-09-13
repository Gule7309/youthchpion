from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Any


class SourceOwnerType(StrEnum):
    INDIVIDUAL_SCHOLAR = "individual_scholar"
    GOVERNMENT = "government"
    INTERNATIONAL_ORGANIZATION = "international_organization"
    RESEARCH_INSTITUTION = "research_institution"
    COMPANY = "company"


class ContentType(StrEnum):
    PEER_REVIEWED_ARTICLE = "peer_reviewed_article"
    WORKING_PAPER = "working_paper"
    GOVERNMENT_REPORT = "government_report"
    OFFICIAL_STATISTICS = "official_statistics"
    INTERNATIONAL_REPORT = "international_report"
    INSTITUTIONAL_REPORT = "institutional_report"
    COMPANY_SURVEY = "company_survey"
    EXPERT_INTERVIEW_TRANSCRIPT = "expert_interview_transcript"


class AgentPhase(StrEnum):
    SEARCHING = "searching"
    RETRIEVING = "retrieving"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"


@dataclass(frozen=True)
class ResearchRequest:
    question: str
    locale: str = "zh-TW"
    max_sources: int = 12
    required_claims: tuple[str, ...] = ()


@dataclass(frozen=True)
class SourceCandidate:
    source_id: str
    title: str
    url: str
    owner_type: SourceOwnerType
    content_type: ContentType
    publisher: str
    published_at: str | None = None
    authors: tuple[str, ...] = ()
    doi: str | None = None
    methodology_url: str | None = None


@dataclass(frozen=True)
class EvidenceExcerpt:
    source_id: str
    text: str
    locator: str
    claim_ids: tuple[str, ...]


@dataclass(frozen=True)
class EvidenceItem:
    claim_id: str
    claim: str
    source: SourceCandidate
    excerpts: tuple[EvidenceExcerpt, ...]
    support: str
    limitations: tuple[str, ...] = ()


@dataclass(frozen=True)
class EvidencePackage:
    question: str
    items: tuple[EvidenceItem, ...]
    gaps: tuple[str, ...] = ()
    status: AgentPhase = AgentPhase.COMPLETED
    schema_version: str = "1.0"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class FinalAnswer:
    package: EvidencePackage


AgentAction = ToolCall | FinalAnswer


@dataclass(frozen=True)
class ToolObservation:
    call_id: str
    tool_name: str
    output: Any
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass
class HarnessState:
    request: ResearchRequest
    phase: AgentPhase = AgentPhase.SEARCHING
    observations: list[ToolObservation] = field(default_factory=list)
    step: int = 0
