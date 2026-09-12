from __future__ import annotations

import asyncio
import hashlib
import json
import re
from datetime import UTC, datetime

from app.http import RetryingHttpClient
from app.models import EvidenceItem, FreshnessStatus

OPENALEX_URL = "https://api.openalex.org/works"
CROSSREF_URL = "https://api.crossref.org/works"

CURATED_EVIDENCE = [
    {
        "key": "ilo_refined_index_2025",
        "title": "Generative AI and Jobs: A Refined Global Index of Occupational Exposure",
        "institution": "International Labour Organization",
        "published_at": "2025-05-20",
        "evidence_type": "international technical report",
        "authority_tier": "A",
        "method_summary": "Task-level exposure scoring across 436 detailed ISCO-08 occupations.",
        "finding": (
            "Generative AI is more likely to transform jobs than fully replace them; "
            "clerical occupations show the highest exposure."
        ),
        "policy_relevance": ["職務再設計", "技能轉型", "暴露指標方法"],
        "limitations": "Global exposure potential is not a Taiwan unemployment forecast.",
        "url": (
            "https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-"
            "occupational-exposure"
        ),
    },
    {
        "key": "oecd_ai_skills_2024",
        "title": "Artificial intelligence and the changing demand for skills in the labour market",
        "institution": "OECD",
        "published_at": "2024",
        "evidence_type": "international policy paper",
        "authority_tier": "A",
        "method_summary": (
            "Cross-country analysis of online job postings and AI-related skill demand."
        ),
        "finding": (
            "AI adoption changes task and skill demand; policy should distinguish AI-specialist "
            "skills from complementary workplace skills."
        ),
        "policy_relevance": ["技能型培訓", "職缺需求", "課程設計"],
        "limitations": "Cross-country evidence must be validated against Taiwan job demand.",
        "url": (
            "https://www.oecd.org/en/publications/artificial-intelligence-and-the-changing-demand-"
            "for-skills-in-the-labour-market_88684e36-en.html"
        ),
    },
    {
        "key": "ilo_worldbank_youth_almp_2026",
        "title": "The impact of active labour market programmes for youth",
        "institution": "ILO / World Bank",
        "published_at": "2026",
        "evidence_type": "evidence synthesis",
        "authority_tier": "A",
        "method_summary": "Evidence synthesis on active labour-market programme designs for youth.",
        "finding": (
            "Use the evidence base to compare training, employment services and bundled "
            "interventions, with explicit evaluation rather than assuming one universal effect."
        ),
        "policy_relevance": ["青年就業方案", "試辦評估", "政策組合"],
        "limitations": "Programme effects depend on design and local labour-market conditions.",
        "url": "https://www.ilo.org/publications/impact-active-labour-market-programmes-youth",
    },
    {
        "key": "moda_digital_access_2024",
        "title": "113年數位近用調查報告",
        "institution": "數位發展部",
        "published_at": "2024",
        "evidence_type": "government public-opinion survey",
        "authority_tier": "A",
        "method_summary": "全國數位近用調查；Dashboard 使用其中 20–29 歲就業網路族分組。",
        "finding": "青年對工作可能受自動化或 AI 取代的主觀感受可作政策溝通訊號。",
        "policy_relevance": ["青年民意", "風險溝通", "政策接受度"],
        "limitations": "主觀感受不等於實際職務暴露或失業機率。",
        "url": "https://srda.sinica.edu.tw/file/e0362889-6adc-4857-9908-4319f33548a3",
    },
    {
        "key": "104_aws_ai_jobs_2025",
        "title": "104 Data × AWS：AI 人才需求與職缺趨勢",
        "institution": "104 人力銀行",
        "published_at": "2025",
        "evidence_type": "enterprise labour-market survey",
        "authority_tier": "C",
        "method_summary": "104 招募資料的 AI 關鍵字與職缺趨勢分析。",
        "finding": "企業 AI 人才需求已跨出純研發職缺，需與官方就業結構交叉驗證。",
        "policy_relevance": ["民間職缺需求", "AI技能", "產學媒合"],
        "limitations": "平台資料不等於全體勞動市場，關鍵字口徑需揭露。",
        "url": "https://blog.104.com.tw/104data-aws-ai/",
    },
]


def _evidence_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha1(value.encode(), usedforsecurity=False).hexdigest()[:10]}"


def _abstract(inverted: dict[str, list[int]] | None) -> str | None:
    if not inverted:
        return None
    ordered = sorted(
        (position, word) for word, positions in inverted.items() for position in positions
    )
    return " ".join(word for _, word in ordered)[:900]


def _canonical_identity(item: EvidenceItem) -> str:
    if item.doi:
        doi = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", item.doi, flags=re.IGNORECASE)
        return f"doi:{doi.strip().lower()}"
    return f"title:{' '.join(item.title.casefold().split())}"


def _interleave(*groups: list[EvidenceItem]):
    for index in range(max((len(group) for group in groups), default=0)):
        for group in groups:
            if index < len(group):
                yield group[index]


def parse_openalex(body: bytes) -> list[EvidenceItem]:
    results = json.loads(body).get("results", [])
    items: list[EvidenceItem] = []
    now = datetime.now(UTC)
    for work in results:
        doi = work.get("doi")
        if not doi:
            continue
        source = ((work.get("primary_location") or {}).get("source") or {}).get("display_name")
        items.append(
            EvidenceItem(
                evidence_id=_evidence_id("oa", str(doi)),
                title=work.get("display_name") or "Untitled research",
                institution=source or "OpenAlex indexed research",
                authors=[
                    entry.get("author", {}).get("display_name", "")
                    for entry in work.get("authorships", [])[:6]
                    if entry.get("author", {}).get("display_name")
                ],
                published_at=work.get("publication_date"),
                evidence_type=work.get("type") or "research",
                authority_tier="B",
                method_summary=None,
                finding=_abstract(work.get("abstract_inverted_index")),
                policy_relevance=["青年就業", "AI技能轉型"],
                limitations=(
                    "OpenAlex metadata; inspect the full text before treating it as "
                    "causal evidence."
                ),
                doi=doi,
                url=doi,
                retrieved_at=now,
                freshness=FreshnessStatus.LIVE,
                discovery_source="openalex",
            )
        )
    return items


def parse_crossref(body: bytes) -> list[EvidenceItem]:
    works = json.loads(body).get("message", {}).get("items", [])
    now = datetime.now(UTC)
    items: list[EvidenceItem] = []
    for work in works:
        doi = work.get("DOI")
        url = work.get("URL") or (f"https://doi.org/{doi}" if doi else None)
        title = (work.get("title") or [None])[0]
        if not url or not title:
            continue
        year_parts = (work.get("published-print") or work.get("published-online") or {}).get(
            "date-parts", []
        )
        published = "-".join(str(value) for value in year_parts[0]) if year_parts else None
        authors = [
            " ".join(filter(None, (entry.get("given"), entry.get("family"))))
            for entry in work.get("author", [])[:6]
        ]
        items.append(
            EvidenceItem(
                evidence_id=_evidence_id("cr", str(url)),
                title=title,
                institution=(work.get("publisher") or "Crossref indexed research"),
                authors=[author for author in authors if author],
                published_at=published,
                evidence_type=(work.get("type") or "research"),
                authority_tier="B",
                finding=(work.get("abstract") or None),
                policy_relevance=["青年就業", "AI技能轉型"],
                limitations="Crossref metadata; abstract and causal findings may be unavailable.",
                doi=doi,
                url=url,
                retrieved_at=now,
                freshness=FreshnessStatus.LIVE,
                discovery_source="crossref",
            )
        )
    return items


def curated_evidence() -> list[EvidenceItem]:
    now = datetime.now(UTC)
    return [
        EvidenceItem(
            evidence_id=f"authority_{item['key']}",
            title=item["title"],
            institution=item["institution"],
            published_at=item["published_at"],
            evidence_type=item["evidence_type"],
            authority_tier=item["authority_tier"],
            method_summary=item["method_summary"],
            finding=item["finding"],
            policy_relevance=item["policy_relevance"],
            limitations=item["limitations"],
            url=item["url"],
            retrieved_at=now,
            freshness=FreshnessStatus.VERSIONED,
            discovery_source="curated",
        )
        for item in CURATED_EVIDENCE
    ]


class EvidenceService:
    def __init__(self, http: RetryingHttpClient) -> None:
        self.http = http
        self.items: dict[str, EvidenceItem] = {}

    async def search(self, query: str, limit: int) -> list[EvidenceItem]:
        per_source = max(2, min(8, limit))
        openalex_call = self.http.get(
            OPENALEX_URL, params={"search": query, "per_page": per_source}
        )
        crossref_call = self.http.get(CROSSREF_URL, params={"query": query, "rows": per_source})
        results = await asyncio.gather(openalex_call, crossref_call, return_exceptions=True)
        groups = [curated_evidence()]
        if not isinstance(results[0], Exception):
            groups.append(parse_openalex(results[0].body))
        if not isinstance(results[1], Exception):
            groups.append(parse_crossref(results[1].body))

        deduped: list[EvidenceItem] = []
        seen: set[str] = set()
        for item in _interleave(*groups):
            identity = _canonical_identity(item)
            if identity in seen:
                continue
            seen.add(identity)
            deduped.append(item)
            self.items[item.evidence_id] = item
            if len(deduped) >= limit:
                break
        return deduped

    def resolve(self, ids: list[str]) -> list[EvidenceItem]:
        missing = [evidence_id for evidence_id in ids if evidence_id not in self.items]
        if missing:
            raise KeyError(", ".join(missing))
        return [self.items[evidence_id] for evidence_id in ids]
