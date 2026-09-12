from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import date, datetime

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult

TAIWANJOBS_URL = "https://free.taiwanjobs.gov.tw/webservice_taipei/Webservice.ashx"
TAIWANJOBS_REFERENCE_URL = "https://free.taiwanjobs.gov.tw/"
AI_PATTERN = re.compile(
    r"(?i)(人工智慧|生成式\s*AI|機器學習|深度學習|LLM|AI\s*工具|Python|資料科學|prompt)"
)

# TaiwanJobs uses its own job taxonomy. This transparent rule-based crosswalk keeps
# unmatched values visible instead of silently pretending they are ISCO codes.
GROUP_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("2", ("資訊", "工程師", "研究", "醫師", "藥師", "教師", "設計")),
    ("4", ("行政", "文書", "會計", "客服", "秘書", "資料輸入")),
    ("3", ("技術", "助理", "品管", "檢驗", "攝影")),
    ("5", ("門市", "餐飲", "照顧", "銷售", "旅遊", "保全", "美容")),
    ("6", ("農", "漁", "畜牧", "園藝")),
    ("1", ("主管", "經理", "執行長")),
    ("7-9", ("操作", "作業員", "司機", "清潔", "技工", "組裝", "營建")),
]


def _text(element: ET.Element, prefix: str) -> str:
    for child in element:
        if child.tag.startswith(prefix):
            return (child.text or "").strip()
    return ""


def _occupation_group(title: str, category: str) -> str | None:
    haystack = f"{title} {category}"
    for group, keywords in GROUP_RULES:
        if any(keyword in haystack for keyword in keywords):
            return group
    return None


def parse_taiwanjobs_xml(body: bytes, today: date | None = None) -> tuple[list[dict], dict]:
    today = today or date.today()
    text = body.decode("utf-8-sig")
    # The feed uses full-width parentheses in element names, which are not legal XML names.
    # Keep the stable ASCII field prefix and remove the human-readable suffix before parsing.
    normalized_xml = re.sub(r"<(/?)([A-Z0-9_]+)（[^>]+）>", r"<\1\2>", text)
    root = ET.fromstring(normalized_xml)
    seen: set[str] = set()
    records: list[dict] = []
    duplicates = expired = missing = 0
    unmatched: set[str] = set()
    for item in root.findall("Data"):
        title = _text(item, "OCCU_DESC")
        category = _text(item, "CJOB_NAME1")
        detail = _text(item, "JOB_DETAIL")
        url = _text(item, "URL_QUERY")
        if not title:
            missing += 1
            continue
        identity = url or "|".join((title, _text(item, "COMPNAME"), _text(item, "CITYNAME")))
        if identity in seen:
            duplicates += 1
            continue
        seen.add(identity)
        stop_date = _text(item, "STOP_DATE")
        if stop_date.isdigit() and len(stop_date) == 8:
            if datetime.strptime(stop_date, "%Y%m%d").date() < today:
                expired += 1
                continue
        group = _occupation_group(title, category)
        if group is None:
            unmatched.add(category or "(missing category)")
        experience = _text(item, "EXPERIENCE")
        entry_level = experience in {"", "無", "不拘", "1年以下"} or "一年" in experience
        records.append(
            {
                "id": identity,
                "title": title,
                "category": category,
                "occupation_code": group,
                "entry_level": entry_level,
                "ai_related": bool(AI_PATTERN.search(f"{title} {detail}")),
                "headcount": int(_text(item, "JOB_PERSON") or 1),
                "location": _text(item, "CITYNAME"),
                "updated_at": _text(item, "TRANDATE"),
                "url": url,
            }
        )
    audit = {
        "duplicates_removed": duplicates,
        "expired_removed": expired,
        "missing_occupation": missing,
        "unmatched_categories": sorted(unmatched)[:12],
        "schema_repairs": ["removed full-width parenthesized labels from XML tag names"],
    }
    return records, audit


class TaiwanJobsAdapter:
    source_id = "taiwanjobs"

    def __init__(self, http: RetryingHttpClient, count: int = 1000) -> None:
        self.http = http
        self.count = count

    async def fetch(self) -> AdapterResult:
        payload = await self.http.get(TAIWANJOBS_URL, params={"count": self.count})
        records, audit = parse_taiwanjobs_xml(payload.body)
        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.LIVE,
            source_url=payload.url,
            dataset_name="勞動部台灣就業通公開職缺 XML",
            reference_url=TAIWANJOBS_REFERENCE_URL,
            processing_steps=[
                "修復來源中不符合 XML 規格的全形括號欄位標籤",
                "依職缺網址或職稱、公司與地區組合去重",
                "排除截止日已過期資料並保留移除筆數",
                "依經驗條件辨識初階職缺，依公開規則辨識 AI 技能關鍵字",
                "將台灣就業通職類對齊七個職業大類；未對齊類別保留在 audit",
            ],
            fields_used=[
                "OCCU_DESC／CJOB_NAME1／JOB_DETAIL：職稱、職類與技能關鍵字",
                "EXPERIENCE／JOB_PERSON：初階條件與徵才人數",
                "STOP_DATE／URL_QUERY：過期檢查與去重識別",
                "CITYNAME／TRANDATE：地區與更新時間脈絡",
            ],
            why_used=(
                "補足官方年度統計的時間落差，"
                "以當期初階職缺和 AI 技能文字觀察青年面對的需求訊號。"
            ),
            limitations=(
                "僅代表本次 API 回傳的前 1,000 筆；"
                "AI 關鍵字與職類 crosswalk 是透明規則，不等於全市場。"
            ),
            input_count_label="筆 API 職缺",
            output_count_label="筆有效職缺",
            retrieved_at=utc_now(),
            http_status=payload.status_code,
            content_type=payload.content_type,
            content_sha256=payload.sha256,
            raw_rows=payload.body.count(b"<Data>"),
            normalized_rows=len(records),
        )
        return AdapterResult(snapshot=snapshot, records=records, audit=audit, raw_body=payload.body)
