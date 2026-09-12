from __future__ import annotations

from datetime import datetime
from html import unescape
from typing import Any

from bs4 import BeautifulSoup

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult

SEARCH_URL = "https://blog.104.com.tw/wp-json/wp/v2/search"
POST_URL = "https://blog.104.com.tw/wp-json/wp/v2/posts/{post_id}"


def _plain_html(value: str) -> str:
    return " ".join(BeautifulSoup(unescape(value), "html.parser").get_text(" ").split())


class Job104Adapter:
    source_id = "job104_research"

    def __init__(self, http: RetryingHttpClient) -> None:
        self.http = http

    async def fetch(self) -> AdapterResult:
        search = await self.http.get(SEARCH_URL, params={"search": "AI 職缺", "per_page": 5})
        items: list[dict[str, Any]] = __import__("json").loads(search.body)
        records: list[dict[str, Any]] = []
        newest: datetime | None = None
        for item in items[:3]:
            post = await self.http.get(POST_URL.format(post_id=item["id"]))
            data = __import__("json").loads(post.body)
            modified = datetime.fromisoformat(data["modified"])
            newest = max(newest, modified) if newest else modified
            records.append(
                {
                    "title": _plain_html(data["title"]["rendered"]),
                    "url": data["link"],
                    "published_at": data["date"],
                    "modified_at": data["modified"],
                    "excerpt": _plain_html(data.get("excerpt", {}).get("rendered", ""))[:420],
                    "source": "104 職場力",
                }
            )
        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.LIVE,
            source_url=search.url,
            retrieved_at=utc_now(),
            source_published_at=newest,
            http_status=search.status_code,
            content_type=search.content_type,
            content_sha256=search.sha256,
            raw_rows=len(items),
            normalized_rows=len(records),
            message="104 official editorial/research posts; not a complete job-listing API",
        )
        return AdapterResult(snapshot=snapshot, records=records, raw_body=search.body)
