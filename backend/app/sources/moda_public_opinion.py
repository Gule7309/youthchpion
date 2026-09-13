from __future__ import annotations

import hashlib
import re
from io import BytesIO
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from pypdf import PdfReader

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult, RawArtifact

SURVEY_INDEX_URL = "https://moda.gov.tw/digital-affairs/digital-service/dv-survey/1005"
SURVEY_TITLE = re.compile(r"^(?P<roc_year>\d{3})年數位近用調查報告$")
PERCENT = re.compile(r"(?<!\d)(?:100\.0|\d{1,2}\.\d)(?!\d)")


def _text(body: bytes) -> str:
    return body.decode("utf-8", errors="replace")


def discover_latest_survey_page(body: bytes, base_url: str) -> tuple[int, str]:
    candidates: list[tuple[int, str]] = []
    for anchor in BeautifulSoup(_text(body), "html.parser").select("a[href]"):
        label = " ".join(anchor.get_text(" ", strip=True).split())
        match = SURVEY_TITLE.fullmatch(label)
        if match:
            period = int(match.group("roc_year")) + 1911
            candidates.append((period, urljoin(base_url, str(anchor["href"]))))
    if not candidates:
        raise ValueError("MODA survey discovery schema drift: annual survey page not found")
    return max(candidates, key=lambda item: item[0])


def discover_report_pdf(body: bytes, base_url: str) -> str:
    for anchor in BeautifulSoup(_text(body), "html.parser").select("a[href]"):
        label = " ".join(anchor.get_text(" ", strip=True).split())
        href = str(anchor["href"])
        if "數位近用調查報告及摘要" in label and "/File/Get/" in href:
            return urljoin(base_url, href)
    raise ValueError("MODA survey page schema drift: official report PDF not found")


def _numeric_rows(text: str, width: int) -> list[list[float]]:
    rows: list[list[float]] = []
    for line in text.splitlines():
        values = [float(value) for value in PERCENT.findall(line)]
        if len(values) == width:
            rows.append(values)
    return rows


def parse_public_opinion_pages(
    page_texts: list[str], expected_period: int
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Parse two stable official survey tables and fail closed on layout drift.

    The PDF does not expose usable Chinese ToUnicode mappings. We therefore locate
    the official table numbers and validate the same indicator across two tables:
    table 8-4 (20-29 annual series) and table 8-2 (latest age cross-section).
    In both tables this indicator is the sixth numeric row from the table end.
    """

    historical_candidates: list[tuple[int, str, list[list[float]]]] = []
    cross_section_candidates: list[tuple[int, list[list[float]]]] = []
    for page_number, text in enumerate(page_texts, start=1):
        if re.search(r"8\s*-\s*4", text) and re.search(r"20\s*-\s*29", text):
            rows = _numeric_rows(text, 5)
            if len(rows) >= 20:
                header = next(
                    (
                        line
                        for line in text.splitlines()
                        if len(re.findall(r"(?<!\d)1\d{2}(?!\d)", line)) >= 5
                    ),
                    "",
                )
                historical_candidates.append((page_number, header, rows))
        if re.search(r"8\s*-\s*2", text) and re.search(r"20\s*-\s*29", text):
            rows = _numeric_rows(text, 10)
            if len(rows) >= 12:
                cross_section_candidates.append((page_number, rows))

    if not historical_candidates:
        raise ValueError("MODA PDF schema drift: table 8-4 was not parseable")
    history_page, header, history_rows = max(
        historical_candidates, key=lambda item: len(item[2])
    )
    if len(history_rows) != 25:
        raise ValueError(
            f"MODA PDF schema drift: table 8-4 has {len(history_rows)} numeric rows, expected 25"
        )
    roc_years = [int(value) for value in re.findall(r"(?<!\d)(1\d{2})(?!\d)", header)[:5]]
    years = [year + 1911 for year in roc_years]
    if len(years) != 5 or years[-1] != expected_period:
        raise ValueError(
            f"MODA PDF period mismatch: table years={years}, discovery={expected_period}"
        )
    annual_values = history_rows[-6]

    if not cross_section_candidates:
        raise ValueError("MODA PDF schema drift: table 8-2 was not parseable")
    cross_page, cross_rows = max(cross_section_candidates, key=lambda item: len(item[1]))
    if len(cross_rows) != 17:
        raise ValueError(
            f"MODA PDF schema drift: table 8-2 has {len(cross_rows)} numeric rows, expected 17"
        )
    cross_section_youth = cross_rows[-6][2]
    if abs(annual_values[-1] - cross_section_youth) > 0.2:
        raise ValueError(
            "MODA PDF cross-table validation failed: "
            f"table8-4={annual_values[-1]}, table8-2={cross_section_youth}"
        )

    series = [
        {"year": year, "value": value}
        for year, value in zip(years, annual_values, strict=True)
    ]
    record = {
        "label": "20–29歲就業網路族認為工作可能被自動化取代",
        "value": annual_values[-1],
        "unit": "%",
        "survey_year": expected_period,
        "source": f"數位發展部 {expected_period - 1911}年數位近用調查",
        "status": "VERSIONED",
        "series": series,
        "table_locator": f"表8-4（PDF第{history_page}頁）；表8-2交叉核對（PDF第{cross_page}頁）",
        "cross_table_value": cross_section_youth,
        "note": (
            "定期更新的官方抽樣調查，衡量青年主觀感受；不等於客觀 AI 取代率，"
            "不參與結構暴露或完整風險分數。兩表因加權與四捨五入可能相差 0.1 個百分點。"
        ),
    }
    audit = {
        "table_8_4_pdf_page": history_page,
        "table_8_2_pdf_page": cross_page,
        "annual_series": series,
        "cross_table_value": cross_section_youth,
        "cross_table_difference_percentage_points": round(
            abs(annual_values[-1] - cross_section_youth), 4
        ),
        "parser_contract": "MODA tables 8-4 and 8-2, sixth numeric row from end",
    }
    return record, audit


def parse_public_opinion_pdf(
    body: bytes, expected_period: int
) -> tuple[dict[str, Any], dict[str, Any]]:
    reader = PdfReader(BytesIO(body))
    page_texts = [page.extract_text() or "" for page in reader.pages]
    return parse_public_opinion_pages(page_texts, expected_period)


class ModaPublicOpinionAdapter:
    source_id = "moda_public_opinion"

    def __init__(self, http: RetryingHttpClient) -> None:
        self.http = http

    async def fetch(self) -> AdapterResult:
        index = await self.http.get(SURVEY_INDEX_URL)
        period, report_page_url = discover_latest_survey_page(index.body, index.url)
        report_page = await self.http.get(report_page_url)
        pdf_url = discover_report_pdf(report_page.body, report_page.url)
        pdf = await self.http.get(pdf_url)
        record, audit = parse_public_opinion_pdf(pdf.body, period)
        record["url"] = report_page.url

        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.VERSIONED,
            source_url=pdf.url,
            dataset_name="數位發展部數位近用調查：青年工作自動化主觀感受",
            reference_url=report_page.url,
            discovery_url=index.url,
            discovery_sha256=hashlib.sha256(index.body).hexdigest(),
            reference_sha256=hashlib.sha256(report_page.body).hexdigest(),
            data_period=str(period),
            processing_steps=[
                "即時讀取數發部歷年調查目錄並選擇最新年度調查",
                "解析官方報告頁並取得該年度報告 PDF",
                "定位表8-4的20–29歲歷年序列與表8-2的最新年齡橫斷面",
                "以兩表數值差不超過0.2個百分點作交叉校驗，版面變更則拒絕發布",
                "保留年度序列、PDF表格頁碼與三層內容雜湊供稽核",
            ],
            fields_used=[
                "20–29歲：青年政策目標族群的民意維度",
                "工作可能被自動化取代的比率：受訪者主觀工作衝擊感受",
                "109–最新年度序列：呈現感受變化而非單一年份定論",
            ],
            why_used="補足客觀就業／職缺資料看不到的青年主觀感受，作政策溝通脈絡。",
            limitations=(
                "這是定期發布的抽樣調查，不是即時社群監測，也不是 AI 造成失業的因果證據；"
                "PDF 中文字型缺少可用文字映射，因此以雙表位置契約交叉驗證，版面改變會失敗關閉。"
            ),
            input_count_label="份官方PDF",
            output_count_label="筆青年民意指標",
            retrieved_at=utc_now(),
            http_status=pdf.status_code,
            content_type="application/pdf",
            content_sha256=hashlib.sha256(pdf.body).hexdigest(),
            raw_rows=1,
            normalized_rows=1,
            message="Latest official versioned survey; refreshed live from the MODA catalog",
        )
        return AdapterResult(
            snapshot=snapshot,
            records=[record],
            audit=audit,
            raw_artifacts=[
                RawArtifact(
                    name="survey-index",
                    url=index.url,
                    content_type=index.content_type,
                    body=index.body,
                ),
                RawArtifact(
                    name="report-page",
                    url=report_page.url,
                    content_type=report_page.content_type,
                    body=report_page.body,
                ),
                RawArtifact(
                    name="survey-report",
                    url=pdf.url,
                    content_type="application/pdf",
                    body=pdf.body,
                ),
            ],
        )
