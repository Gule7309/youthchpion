from __future__ import annotations

import ipaddress
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
    "ilo.org",
    "oecd.org",
    "un.org",
    "worldbank.org",
    "europa.eu",
    "nber.org",
    "rand.org",
    "sinica.edu.tw",
)

_DISCOVERY_INDEX_DOMAINS = frozenset({"openalex.org", "crossref.org"})

_ALLOWED_CONTENT_BY_OWNER = {
    SourceOwnerType.INDIVIDUAL_SCHOLAR: frozenset(
        {ContentType.PEER_REVIEWED_ARTICLE, ContentType.WORKING_PAPER}
    ),
    SourceOwnerType.GOVERNMENT: frozenset(
        {ContentType.GOVERNMENT_REPORT, ContentType.OFFICIAL_STATISTICS}
    ),
    SourceOwnerType.INTERNATIONAL_ORGANIZATION: frozenset(
        {ContentType.INTERNATIONAL_REPORT, ContentType.OFFICIAL_STATISTICS}
    ),
    SourceOwnerType.RESEARCH_INSTITUTION: frozenset(
        {
            ContentType.PEER_REVIEWED_ARTICLE,
            ContentType.WORKING_PAPER,
            ContentType.INSTITUTIONAL_REPORT,
            ContentType.EXPERT_INTERVIEW_TRANSCRIPT,
        }
    ),
}

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
        if host in _DISCOVERY_INDEX_DOMAINS:
            raise SourcePolicyError(f"bibliographic index metadata cannot be published: {host}")
        if self._is_private_host(host):
            raise SourcePolicyError(f"private or local source host is prohibited: {host}")

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

        allowed_content = _ALLOWED_CONTENT_BY_OWNER.get(candidate.owner_type, frozenset())
        if candidate.content_type not in allowed_content:
            raise SourcePolicyError(
                f"content type {candidate.content_type} is incompatible with owner "
                f"{candidate.owner_type}"
            )
        if not self._is_authoritative_host(host):
            raise SourcePolicyError(f"domain is outside the authoritative allowlist: {host}")

    def validate_retrieval(self, candidate: SourceCandidate, retrieved_url: str) -> None:
        """Revalidate the final URL after redirects instead of trusting the discovery URL."""
        self.validate(candidate)
        original_host = self._host(candidate.url)
        final_host = self._host(retrieved_url)
        if self._is_news_host(final_host):
            raise SourcePolicyError(f"retrieval redirected to news or media: {final_host}")
        if final_host in _DISCOVERY_INDEX_DOMAINS:
            raise SourcePolicyError(
                f"retrieval ended at bibliographic index metadata: {final_host}"
            )
        if self._is_private_host(final_host):
            raise SourcePolicyError(f"retrieval redirected to private or local host: {final_host}")
        if self._matches_domain(final_host, original_host):
            return
        if original_host == "doi.org" and candidate.doi:
            # DOI is the trust anchor for indexed scholarly material. The final publisher host is
            # recorded in the claim receipt and still must be public and non-media.
            return
        if not self._is_authoritative_host(final_host):
            raise SourcePolicyError(
                f"retrieval redirected outside the authoritative allowlist: {final_host}"
            )

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

    @staticmethod
    def _is_private_host(host: str) -> bool:
        if host == "localhost" or host.endswith(".localhost"):
            return True
        try:
            address = ipaddress.ip_address(host.strip("[]"))
        except ValueError:
            return False
        return any(
            (
                address.is_private,
                address.is_loopback,
                address.is_link_local,
                address.is_reserved,
                address.is_unspecified,
            )
        )
