from __future__ import annotations

import hashlib
import json
from datetime import datetime
from html import unescape
from typing import Any

from bs4 import BeautifulSoup

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult

SEARCH_URL = "https://blog.104.com.tw/wp-json/wp/v2/search"
POST_URL = "https://blog.104.com.tw/wp-json/wp/v2/posts/{post_id}"
REFERENCE_URL = "https://blog.104.com.tw/?s=AI%20%E8%81%B7%E7%BC%BA"


def _plain_html(value: str) -> str:
    return " ".join(BeautifulSoup(unescape(value), "html.parser").get_text(" ").split())


class Job104Adapter:
    source_id = "job104_research"

    def __init__(self, http: RetryingHttpClient) -> None:
        self.http = http

    async def fetch(self) -> AdapterResult:
        search = await self.http.get(SEARCH_URL, params={"search": "AI 職缺", "per_page": 5})
        items: list[dict[str, Any]] = json.loads(search.body)
        records: list[dict[str, Any]] = []
        post_payloads: list[dict[str, Any]] = []
        newest: datetime | None = None
        for item in items[:3]:
            post = await self.http.get(POST_URL.format(post_id=item["id"]))
            data = json.loads(post.body)
            post_payloads.append(data)
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
        raw_bundle = json.dumps(
            {"search": items, "posts": post_payloads},
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.LIVE,
            source_url=search.url,
            dataset_name="104 職場力 AI 職缺／人才趨勢文章",
            reference_url=REFERENCE_URL,
            processing_steps=[
                "即時查詢 104 官方 WordPress 搜尋 API",
                "取得前三篇文章 metadata 與實際文章連結",
                "移除 HTML 標籤並保留標題、摘要、發布與修改時間",
                "內容雜湊涵蓋搜尋結果與三篇實際解析文章",
                "僅作民間產業趨勢訊號，不冒充完整職缺母體",
            ],
            fields_used=[
                "title／link：文章主題與可核對原文",
                "date／modified：發布與最後更新時間",
                "excerpt：去除 HTML 後的趨勢摘要",
            ],
            why_used="提供政府統計之外的民間人才市場觀察，用於解釋 AI 技能與企業需求脈絡。",
            limitations=(
                "這是 104 官方內容搜尋，不是完整職缺 API；"
                "5→3 是選取前三篇解析，不宣稱為資料清洗。"
            ),
            input_count_label="篇搜尋命中",
            output_count_label="篇內容解析",
            retrieved_at=utc_now(),
            source_published_at=newest,
            http_status=search.status_code,
            content_type="application/json",
            content_sha256=hashlib.sha256(raw_bundle).hexdigest(),
            raw_rows=len(items),
            normalized_rows=len(records),
            message="104 official editorial/research posts; not a complete job-listing API",
        )
        return AdapterResult(snapshot=snapshot, records=records, raw_body=raw_bundle)
