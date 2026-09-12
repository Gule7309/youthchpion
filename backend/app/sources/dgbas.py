from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

from openpyxl import load_workbook

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult

DGBAS_URL = "https://ws.dgbas.gov.tw/001/Upload/463/relfile/11516/234727/table47.xlsx"
DGBAS_REFERENCE_URL = "https://www.stat.gov.tw/News_Content.aspx?n=4001&s=236078"

# The public workbook is bilingual. Rows 14-20 are the seven published occupation groups;
# row names are mapped only after verifying their embedded English label.
ROW_MAP = {
    14: ("1", "主管及經理人員"),
    15: ("2", "專業人員"),
    16: ("3", "技術員及助理專業人員"),
    17: ("4", "事務支援人員"),
    18: ("5", "服務及銷售工作人員"),
    19: ("6", "農林漁牧業生產人員"),
    20: ("7-9", "技藝、機械操作及基層技術人員"),
}
EXPECTED_ENGLISH = {
    14: "Managers",
    15: "Professionals",
    16: "Technicians",
    17: "Clerical Support",
    18: "Service & Sales",
    19: "Skilled Agricultural",
    20: "Craft & Machine",
}


def _number(value: Any) -> int:
    if value in (None, "-", ""):
        return 0
    return int(round(float(value) * 1000))


def parse_dgbas_workbook(body: bytes) -> list[dict[str, Any]]:
    sheet = load_workbook(BytesIO(body), data_only=True).active
    records: list[dict[str, Any]] = []
    for row, (code, name) in ROW_MAP.items():
        raw_label = str(sheet.cell(row, 2).value or "")
        if EXPECTED_ENGLISH[row].lower() not in raw_label.lower():
            raise ValueError(f"DGBAS schema drift at row {row}: missing English occupation label")
        # Columns: 15=20-24, 17=25-29. Values are thousands of people.
        youth_employed = _number(sheet.cell(row, 15).value) + _number(sheet.cell(row, 17).value)
        total_employed = _number(sheet.cell(row, 3).value)
        records.append(
            {
                "code": code,
                "name": name,
                "youth_employed": youth_employed,
                "total_employed": total_employed,
                "youth_employment_share": (
                    round(youth_employed / total_employed, 4) if total_employed else None
                ),
                "age_columns": {"20-24": 15, "25-29": 17},
            }
        )
    return records


class DgbasAdapter:
    source_id = "dgbas_employment"

    def __init__(self, http: RetryingHttpClient) -> None:
        self.http = http

    async def fetch(self) -> AdapterResult:
        payload = await self.http.get(DGBAS_URL)
        records = parse_dgbas_workbook(payload.body)
        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.LIVE,
            source_url=payload.url,
            dataset_name="主計總處人力資源調查統計年報表 47",
            reference_url=DGBAS_REFERENCE_URL,
            processing_steps=[
                "驗證表 47 職業列與英文標籤，欄位漂移即停止發布",
                "擷取 20–24 歲與 25–29 歲兩個年齡欄",
                "將原始單位由千人換算為整數人數",
                "統一為七個職業大類，供 ILO 指標對齊",
            ],
            retrieved_at=utc_now(),
            source_published_at=datetime(2026, 8, 1),
            http_status=payload.status_code,
            content_type=payload.content_type,
            content_sha256=payload.sha256,
            raw_rows=7,
            normalized_rows=len(records),
            message=(
                "Official DGBAS endpoint requires scoped TLS compatibility mode; "
                "workbook schema validated after download."
            ),
        )
        return AdapterResult(
            snapshot=snapshot,
            records=records,
            audit={"age_filter": ["20-24", "25-29"], "unit_conversion": "thousand→person"},
            raw_body=payload.body,
        )
