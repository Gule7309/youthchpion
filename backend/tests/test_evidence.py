from __future__ import annotations

import json

import pytest

from app.evidence import CROSSREF_URL, OPENALEX_URL, EvidenceService
from app.http import HttpPayload


class SearchHttp:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def get(self, url: str, params: dict | None = None) -> HttpPayload:
        self.calls.append((url, params or {}))
        if url == OPENALEX_URL:
            body = {
                "results": [{
                    "id": "https://openalex.org/W1",
                    "doi": "https://doi.org/10.1000/live",
                    "display_name": "Live AI employment study",
                    "publication_date": "2026-09-01",
                    "type": "article",
                    "primary_location": {"source": {"display_name": "Test Journal"}},
                    "authorships": [],
                    "abstract_inverted_index": {"AI": [0], "changes": [1], "tasks": [2]},
                }]
            }
        else:
            body = {
                "message": {"items": [{
                    "DOI": "10.1000/crossref",
                    "URL": "https://doi.org/10.1000/crossref",
                    "title": ["Live youth skills study"],
                    "publisher": "Test Publisher",
                    "type": "journal-article",
                }]}
            }
        return HttpPayload(
            url=url,
            status_code=200,
            content_type="application/json",
            body=json.dumps(body).encode(),
        )


@pytest.mark.asyncio
async def test_evidence_search_calls_both_live_indexes_and_keeps_live_candidates() -> None:
    http = SearchHttp()

    items = await EvidenceService(http).search("AI youth employment", 8)

    assert {call[0] for call in http.calls} == {OPENALEX_URL, CROSSREF_URL}
    assert any(item.title == "Live AI employment study" for item in items)
    assert any(item.title == "Live youth skills study" for item in items)
    assert all(call[1] for call in http.calls)
