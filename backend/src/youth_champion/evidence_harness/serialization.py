from __future__ import annotations

from typing import Any

from .contracts import ContentType, EvidenceExcerpt, EvidenceItem, EvidencePackage, SourceCandidate, SourceOwnerType


def evidence_package_from_dict(raw: dict[str, Any]) -> EvidencePackage:
    items = []
    for value in raw.get("items", []):
        source_raw = value["source"]
        source = SourceCandidate(
            source_id=source_raw["source_id"],
            title=source_raw["title"],
            url=source_raw["url"],
            owner_type=SourceOwnerType(source_raw["owner_type"]),
            content_type=ContentType(source_raw["content_type"]),
            publisher=source_raw["publisher"],
            published_at=source_raw.get("published_at"),
            authors=tuple(source_raw.get("authors", ())),
            doi=source_raw.get("doi"),
            methodology_url=source_raw.get("methodology_url"),
        )
        excerpts = tuple(
            EvidenceExcerpt(
                source_id=e["source_id"], text=e["text"], locator=e["locator"], claim_ids=tuple(e["claim_ids"])
            )
            for e in value.get("excerpts", [])
        )
        items.append(EvidenceItem(value["claim_id"], value["claim"], source, excerpts, value["support"], tuple(value.get("limitations", ()))))
    return EvidencePackage(question=raw["question"], items=tuple(items), gaps=tuple(raw.get("gaps", ())))

