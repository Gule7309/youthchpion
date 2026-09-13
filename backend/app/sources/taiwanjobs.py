from __future__ import annotations

import asyncio
import hashlib
import re
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date, datetime

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult, RawArtifact

TAIWANJOBS_URL = "https://free.taiwanjobs.gov.tw/webservice_taipei/Webservice.ashx"
TAIWANJOBS_REFERENCE_URL = "https://free.taiwanjobs.gov.tw/"
AI_DEVELOPMENT_PATTERN = re.compile(
    r"(?i)(人工智慧(?:工程|開發|模型)|機器學習|深度學習|large language model|"
    r"\bLLMs?\b|\bRAG\b|\bNLP\b|\bMLOps\b|computer vision|電腦視覺|"
    r"TensorFlow|PyTorch|AI\s*(?:engineer|developer|工程師|開發))"
)
AI_APPLICATION_PATTERN = re.compile(
    r"(?i)(生成式\s*AI|AI\s*工具|ChatGPT|GitHub\s*Copilot|Microsoft\s*Copilot|"
    r"prompt\s*(?:engineering|工程)|(?<![A-Za-z])AI(?![A-Za-z]))"
)
GENERIC_PROGRAMMING_PATTERN = re.compile(r"(?i)(\bPython\b|資料科學|data science)")
CROSSWALK_VERSION = "taiwanjobs-official-code-v1"
DEFAULT_JOBNOS = tuple(f"{value:02d}" for value in range(1, 23))

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

# TaiwanJobs publishes a versioned six-digit common occupation code. Its 22 major
# families are not identical to ISCO, so ambiguous sub-codes are overridden before
# applying a documented major-family default. Title rules are fallback only.
OFFICIAL_MAJOR_DEFAULTS: dict[str, str | None] = {
    "01": "4", "02": "5", "03": "2", "04": "4", "05": "2", "06": "5",
    "07": "2", "08": "2", "09": "7-9", "10": "7-9", "11": "7-9",
    "12": "2", "13": "2", "14": "2", "15": "7-9", "16": "5",
    "17": "2", "18": "5", "19": "7-9", "20": "6", "21": "2", "22": None,
}
OFFICIAL_CODE_OVERRIDES: dict[str, str] = {
    "010101": "1", "010105": "1", "010301": "1",
    "020101": "1", "020103": "4", "020104": "4", "020202": "4", "020301": "1",
    "030103": "4", "030204": "4",
    "040109": "2", "040112": "2", "040207": "2", "040302": "2",
    "060101": "1", "070116": "3", "070290": "1", "080105": "3", "080106": "3",
    "090105": "3", "090213": "4", "090214": "4", "090304": "2", "090306": "2",
    "100122": "2", "110102": "2", "110103": "1", "110104": "2", "110110": "3",
    "110111": "1", "110113": "3", "110115": "2", "110201": "3", "110202": "3",
    "130106": "3", "130111": "3", "140106": "3", "140120": "5", "140121": "5",
    "150101": "2", "150303": "4", "150304": "4", "150305": "4", "150306": "4",
    "170110": "4", "170112": "4", "170113": "5", "170116": "4", "170126": "4",
    "170130": "5", "170201": "5", "170202": "5", "170203": "5", "170207": "5",
    "170208": "5", "180102": "5", "190301": "5", "210204": "1", "210301": "1",
    "220102": "5", "220106": "2",
}


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


def _official_occupation_group(
    small_code: str,
    title: str,
    category: str,
) -> tuple[str | None, str]:
    if small_code in OFFICIAL_CODE_OVERRIDES:
        return OFFICIAL_CODE_OVERRIDES[small_code], "official_small_code_override"
    if len(small_code) >= 2 and small_code[:2] in OFFICIAL_MAJOR_DEFAULTS:
        group = OFFICIAL_MAJOR_DEFAULTS[small_code[:2]]
        if group is not None:
            return group, "official_major_code_default"
    fallback = _occupation_group(title, category)
    return fallback, "text_fallback" if fallback is not None else "unmapped"


def _entry_level(title: str, detail: str, experience: str) -> bool | None:
    if re.search(r"(實習|intern|新鮮人|應屆)", f"{title} {detail}", re.IGNORECASE):
        return True
    normalized = experience.strip().replace(" ", "")
    if not normalized:
        return None
    if normalized in {"無", "不拘", "1年內", "1年以下", "一年內", "一年以下"}:
        return True
    if re.search(r"(?:[2-9]|1[0-9])年(?:以上|經驗)", normalized):
        return False
    if "1年以上" in normalized or "一年以上" in normalized:
        return False
    return None


def _ai_skill_category(text: str) -> str:
    if AI_DEVELOPMENT_PATTERN.search(text):
        return "ai_development"
    if AI_APPLICATION_PATTERN.search(text):
        return "ai_application"
    if GENERIC_PROGRAMMING_PATTERN.search(text):
        return "generic_programming"
    return "none"


def _quality_metrics(records: list[dict]) -> dict:
    valid_entry = [record for record in records if record["quality_entry"]]
    ai_entry = [record for record in valid_entry if record["ai_related"]]
    mapped_entry = [record for record in valid_entry if record["occupation_code"]]
    mapped_ai_entry = [record for record in ai_entry if record["occupation_code"]]
    entry_headcount = sum(int(record["headcount"]) for record in valid_entry)
    ai_headcount = sum(int(record["headcount"]) for record in ai_entry)
    return {
        "crosswalk_version": CROSSWALK_VERSION,
        "mapping_method_counts": dict(
            Counter(str(record["occupation_mapping_method"]) for record in records)
        ),
        "entry_level_counts": {
            "true": sum(record["entry_level"] is True for record in records),
            "false": sum(record["entry_level"] is False for record in records),
            "unknown": sum(record["entry_level"] is None for record in records),
        },
        "ai_skill_category_counts": dict(
            Counter(str(record["ai_skill_category"]) for record in records)
        ),
        "quality_entry_records": len(valid_entry),
        "quality_entry_headcount": entry_headcount,
        "entry_crosswalk_coverage": (
            round(len(mapped_entry) / len(valid_entry), 4) if valid_entry else None
        ),
        "ai_entry_records": len(ai_entry),
        "ai_entry_headcount": ai_headcount,
        "ai_subsample_crosswalk_coverage": (
            round(len(mapped_ai_entry) / len(ai_entry), 4) if ai_entry else None
        ),
        "ai_subsample_crosswalk_coverage_by_headcount": (
            round(
                sum(int(record["headcount"]) for record in mapped_ai_entry) / ai_headcount,
                4,
            )
            if ai_headcount
            else None
        ),
    }


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
        major_code = _text(item, "CJOB1_COUNT")
        category = _text(item, "CJOB_NAME1")
        small_code = _text(item, "CJOB2_COUNT")
        small_category = _text(item, "CJOB_NAME2")
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
        group, mapping_method = _official_occupation_group(
            small_code, title, f"{category} {small_category}"
        )
        if group is None:
            unmatched.add(f"{small_code or '(no code)'} {small_category or category}")
        experience = _text(item, "EXPERIENCE")
        entry_level = _entry_level(title, detail, experience)
        work_type = _text(item, "WK_TYPE")
        skill_category = _ai_skill_category(f"{title} {detail}")
        headcount = int(_text(item, "JOB_PERSON") or 1)
        records.append(
            {
                "id": identity,
                "title": title,
                "category": category,
                "small_category": small_category,
                "official_major_code": major_code,
                "official_occupation_code": small_code,
                "occupation_code": group,
                "occupation_mapping_method": mapping_method,
                "entry_level": entry_level,
                "quality_entry": entry_level is True and work_type == "全職",
                "experience_raw": experience,
                "work_type": work_type,
                "ai_skill_category": skill_category,
                "ai_related": skill_category in {"ai_development", "ai_application"},
                "headcount": headcount,
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
        **_quality_metrics(records),
        "schema_repairs": ["removed full-width parenthesized labels from XML tag names"],
    }
    return records, audit


class TaiwanJobsAdapter:
    source_id = "taiwanjobs"

    def __init__(
        self,
        http: RetryingHttpClient,
        count: int = 1000,
        jobnos: tuple[str, ...] = DEFAULT_JOBNOS,
    ) -> None:
        self.http = http
        self.count = count
        self.jobnos = jobnos

    async def fetch(self) -> AdapterResult:
        semaphore = asyncio.Semaphore(4)

        async def fetch_stratum(jobno: str):
            async with semaphore:
                return await self.http.get(
                    TAIWANJOBS_URL,
                    params={"jobno": jobno, "count": self.count},
                )

        payloads = await asyncio.gather(*(fetch_stratum(jobno) for jobno in self.jobnos))
        records: list[dict] = []
        artifacts: list[RawArtifact] = []
        seen: set[str] = set()
        duplicates = expired = missing = raw_rows = 0
        unmatched: set[str] = set()
        truncated_strata: list[str] = []
        for jobno, payload in zip(self.jobnos, payloads, strict=True):
            stratum_records, stratum_audit = parse_taiwanjobs_xml(payload.body)
            stratum_raw_rows = payload.body.count(b"<Data>")
            raw_rows += stratum_raw_rows
            duplicates += int(stratum_audit["duplicates_removed"])
            expired += int(stratum_audit["expired_removed"])
            missing += int(stratum_audit["missing_occupation"])
            unmatched.update(stratum_audit["unmatched_categories"])
            if stratum_raw_rows >= self.count:
                truncated_strata.append(jobno)
            for record in stratum_records:
                if record["id"] in seen:
                    duplicates += 1
                    continue
                seen.add(record["id"])
                record["query_jobno"] = jobno
                records.append(record)
            artifacts.append(
                RawArtifact(
                    name=f"jobno-{jobno}",
                    url=payload.url,
                    content_type=payload.content_type,
                    body=payload.body,
                )
            )
        audit = {
            "duplicates_removed": duplicates,
            "expired_removed": expired,
            "missing_occupation": missing,
            "unmatched_categories": sorted(unmatched)[:12],
            **_quality_metrics(records),
            "query_strategy": "official common-occupation major-code strata",
            "queried_jobnos": list(self.jobnos),
            "count_per_stratum": self.count,
            "truncated_strata": truncated_strata,
            "schema_repairs": ["removed full-width parenthesized labels from XML tag names"],
        }
        combined_hash = hashlib.sha256(
            "\n".join(
                f"{jobno}:{payload.sha256}"
                for jobno, payload in zip(self.jobnos, payloads, strict=True)
            ).encode()
        ).hexdigest()
        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.LIVE,
            source_url=payload.url,
            dataset_name="勞動部台灣就業通公開職缺 XML",
            reference_url=TAIWANJOBS_REFERENCE_URL,
            processing_steps=[
                "修復來源中不符合 XML 規格的全形括號欄位標籤",
                f"以官方 jobno 大類分 {len(self.jobnos)} 層查詢，每層最多 {self.count} 筆",
                "依職缺網址或職稱、公司與地區組合去重",
                "排除截止日已過期資料並保留移除筆數",
                "將經驗分類為 true／false／unknown；空白不再直接算初階職缺",
                "AI 技能拆成開發、應用、一般程式設計；Python 單獨出現不算 AI",
                "優先用官方六碼職類代碼對齊七大類，文字只作可稽核 fallback",
                "分別計算初階樣本與 AI 子樣本的職類對應覆蓋率",
            ],
            fields_used=[
                "CJOB1_COUNT／CJOB2_COUNT：官方職業代碼與主要 crosswalk",
                "OCCU_DESC／CJOB_NAME1／CJOB_NAME2／JOB_DETAIL：分類核對與技能文字",
                "EXPERIENCE／WK_TYPE／JOB_PERSON：初階正職條件與徵才人數",
                "STOP_DATE／URL_QUERY：過期檢查與去重識別",
                "CITYNAME／TRANDATE：地區與更新時間脈絡",
            ],
            why_used=(
                "補足官方年度統計的時間落差，"
                "以當期初階職缺和 AI 技能文字觀察青年面對的需求訊號。"
            ),
            limitations=(
                f"共 {len(self.jobnos)} 個官方職類分層；"
                f"其中 {len(truncated_strata)} 層達 API 上限，仍可能截斷。"
                "即使分類與 coverage 通過，也只代表台灣就業通而非全市場。"
                "D 在樣本數或 AI 子樣本 coverage 不足時必須保持空值。"
            ),
            input_count_label="筆 API 職缺",
            output_count_label="筆有效職缺",
            retrieved_at=utc_now(),
            http_status=200,
            content_type="application/vnd.youthchpion.raw-manifest+json",
            content_sha256=combined_hash,
            raw_rows=raw_rows,
            normalized_rows=len(records),
            message=(
                f"Queried {len(self.jobnos)} official jobno strata; "
                f"{len(truncated_strata)} reached the per-query limit"
            ),
        )
        return AdapterResult(
            snapshot=snapshot,
            records=records,
            audit=audit,
            raw_artifacts=artifacts,
        )
