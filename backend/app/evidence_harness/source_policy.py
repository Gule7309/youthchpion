from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlparse

from .contracts import ContentType, SourceCandidate, SourceOwnerType


class SourcePolicyError(ValueError):
    """Raised when material is not eligible for evidence processing."""


_DEFAULT_AUTHORITATIVE_SUFFIXES = (
    ".gov",
    ".gov.tw",
    ".edu",
    ".edu.tw",
    "doi.org",
    "openalex.org",
    "crossref.org",
    "ilo.org",
    "oecd.org",
    "un.org",
    "worldbank.org",
    "europa.eu",
    "nber.org",
    "rand.org",
    "sinica.edu.tw",
)

_NEWS_HOST_MARKERS = (
    "news.",
    "reuters.",
    "apnews.",
    "bbc.",
    "cnn.",
    "nytimes.",
    "theguardian.",
    "bloomberg.",
    "cna.com.tw",
    "udn.com",
    "ettoday.",
    "ltn.com.tw",
    "storm.mg",
)


@dataclass(frozen=True)
class SourcePolicy:
    """Deterministic ingress and publication policy; the model cannot override it."""

    additional_authoritative_domains: frozenset[str] = field(default_factory=frozenset)
    approved_company_domains: frozenset[str] = field(default_factory=frozenset)

    def validate(self, candidate: SourceCandidate) -> None:
        host = self._host(candidate.url)
        if self._is_news_host(host):
            raise SourcePolicyError(f"news or media source is prohibited: {host}")

        if candidate.owner_type is SourceOwnerType.COMPANY:
            if host not in self.approved_company_domains:
                raise SourcePolicyError(f"company domain is not approved: {host}")
            if candidate.content_type is not ContentType.COMPANY_SURVEY:
                raise SourcePolicyError("company sources must be methodology-backed surveys")
            if not candidate.methodology_url:
                raise SourcePolicyError("company survey is missing a methodology URL")
            if self._host(candidate.methodology_url) != host:
                raise SourcePolicyError(
                    "company survey methodology must use the same approved domain"
                )
            return

        if not self._is_authoritative_host(host):
            raise SourcePolicyError(f"domain is outside the authoritative allowlist: {host}")

    def filter(self, candidates: list[SourceCandidate]) -> tuple[list[SourceCandidate], list[str]]:
        accepted: list[SourceCandidate] = []
        rejected: list[str] = []
        for candidate in candidates:
            try:
                self.validate(candidate)
            except SourcePolicyError as exc:
                rejected.append(f"{candidate.source_id}: {exc}")
            else:
                accepted.append(candidate)
        return accepted, rejected

    def _is_authoritative_host(self, host: str) -> bool:
        domains = _DEFAULT_AUTHORITATIVE_SUFFIXES + tuple(self.additional_authoritative_domains)
        return any(self._matches_domain(host, suffix) for suffix in domains)

    @staticmethod
    def _matches_domain(host: str, value: str) -> bool:
        domain = value.lstrip(".")
        return host == domain or host.endswith(f".{domain}")

    @staticmethod
    def _host(url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise SourcePolicyError("source URL must be absolute HTTP(S)")
        return parsed.hostname.lower().removeprefix("www.")

    @staticmethod
    def _is_news_host(host: str) -> bool:
        return any(marker in host for marker in _NEWS_HOST_MARKERS)
