from __future__ import annotations

import asyncio
from collections import defaultdict
from hashlib import sha256
from pathlib import Path
from typing import Any

from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult

SOURCE_ID = "dgbas_microdata_18_35"
REFERENCE_URL = "https://doi.org/10.6141/TW-SRDA-AA000047-1"
MINIMUM_ANNUAL_ROWS = 100_000

OCCUPATION_NAMES = {
    "1": "主管及經理人員",
    "2": "專業人員",
    "3": "技術員及助理專業人員",
    "4": "事務支援人員",
    "5": "服務及銷售工作人員",
    "6": "農林漁牧業生產人員",
    "7-9": "技藝、機械操作及基層技術人員",
}


def _integer_field(line: str, start: int, end: int, name: str) -> int:
    value = line[start:end].strip()
    if not value:
        return 0
    if not value.isdigit():
        raise ValueError(f"DGBAS microdata has non-numeric {name}: {value!r}")
    return int(value)


def _occupation_group(detail_code: int) -> str | None:
    # 01 is Armed Forces and is outside the seven civilian occupation groups.
    if detail_code < 11 or detail_code > 99:
        return None
    major = detail_code // 10
    if major in {1, 2, 3, 4, 5, 6}:
        return str(major)
    if major in {7, 8, 9}:
        return "7-9"
    return None


def parse_dgbas_microdata(body: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Aggregate licensed annual fixed-width microdata without retaining person rows.

    SRDA 113-year layout: a3 age at columns 22-24, a22 main occupation at
    columns 81-82, and expansion weight at columns 87-91 (all one-based).
    Annual weighted estimates are divided by 12 per the SRDA usage note.
    """

    try:
        text = body.decode("ascii")
    except UnicodeDecodeError as exc:
        raise ValueError("DGBAS microdata must be the numeric ASCII lb113.dat file") from exc

    weighted_total: dict[str, int] = defaultdict(int)
    weighted_groups: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    sample_groups: dict[str, int] = defaultdict(int)
    raw_rows = 0
    employed_rows = 0
    unmapped_occupation_rows = 0

    for raw_line in text.splitlines():
        if not raw_line.strip():
            continue
        raw_rows += 1
        if len(raw_line) < 91:
            raise ValueError(
                f"DGBAS microdata row {raw_rows} is {len(raw_line)} columns; expected at least 91"
            )
        age = _integer_field(raw_line, 21, 24, "a3 age")
        detail_code = _integer_field(raw_line, 80, 82, "a22 occupation")
        weight = _integer_field(raw_line, 86, 91, "weight")
        code = _occupation_group(detail_code)
        if code is None:
            if detail_code:
                unmapped_occupation_rows += 1
            continue
        if weight <= 0:
            raise ValueError(f"DGBAS microdata row {raw_rows} has non-positive weight")

        employed_rows += 1
        weighted_total[code] += weight
        if 18 <= age <= 35:
            weighted_groups[code]["18-35"] += weight
            sample_groups["18-35"] += 1
            if age <= 24:
                weighted_groups[code]["18-24"] += weight
                sample_groups["18-24"] += 1
                if age >= 20:
                    weighted_groups[code]["20-24"] += weight
                    sample_groups["20-24"] += 1
            elif age <= 29:
                weighted_groups[code]["25-29"] += weight
                sample_groups["25-29"] += 1
            else:
                weighted_groups[code]["30-35"] += weight
                sample_groups["30-35"] += 1

    if not raw_rows:
        raise ValueError("DGBAS microdata is empty")

    def annual_average(value: int) -> int:
        return int(round(value / 12))

    records = []
    for code, name in OCCUPATION_NAMES.items():
        total = annual_average(weighted_total[code])
        youth_18_24 = annual_average(weighted_groups[code]["18-24"])
        youth_20_24 = annual_average(weighted_groups[code]["20-24"])
        youth_25_29 = annual_average(weighted_groups[code]["25-29"])
        youth_30_35 = annual_average(weighted_groups[code]["30-35"])
        youth_18_35 = annual_average(weighted_groups[code]["18-35"])
        records.append(
            {
                "code": code,
                "name": name,
                "youth_employed": youth_18_35,
                "youth_employed_18_24": youth_18_24,
                "youth_employed_20_24": youth_20_24,
                "youth_employed_25_29": youth_25_29,
                "youth_employed_30_35": youth_30_35,
                "youth_employed_18_35": youth_18_35,
                "total_employed": total,
                "youth_employment_share": round(youth_18_35 / total, 4) if total else None,
                "age_filter": {"minimum": 18, "maximum": 35, "exact": True},
            }
        )

    audit = {
        "raw_rows": raw_rows,
        "employed_rows": employed_rows,
        "unmapped_occupation_rows": unmapped_occupation_rows,
        "sample_rows_by_age_group": dict(sample_groups),
        "weighting": "sum(weight) / 12 annual average",
        "age_filter": "18 <= a3 <= 35",
        "occupation_field": "a22 main occupation, grouped to 1-6 and 7-9",
    }
    return records, audit


class DgbasMicrodataAdapter:
    source_id = SOURCE_ID

    def __init__(
        self,
        *,
        data_period: int,
        local_path: Path | None = None,
        bucket: str | None = None,
        s3_key: str | None = None,
        minimum_rows: int = MINIMUM_ANNUAL_ROWS,
    ) -> None:
        if (local_path is None) == (not bucket or not s3_key):
            raise ValueError("configure exactly one DGBAS microdata location")
        self.data_period = data_period
        self.local_path = local_path
        self.bucket = bucket
        self.s3_key = s3_key
        self.minimum_rows = minimum_rows

    async def _read(self) -> bytes:
        if self.local_path is not None:
            path = self.local_path.resolve()
            if not path.is_file():
                raise FileNotFoundError(f"DGBAS microdata file does not exist: {path}")
            return await asyncio.to_thread(path.read_bytes)

        import boto3

        client = boto3.client("s3")
        response = await asyncio.to_thread(
            client.get_object,
            Bucket=self.bucket,
            Key=self.s3_key,
        )
        return await asyncio.to_thread(response["Body"].read)

    async def fetch(self) -> AdapterResult:
        body = await self._read()
        records, audit = parse_dgbas_microdata(body)
        if audit["raw_rows"] < self.minimum_rows:
            raise ValueError(
                f"DGBAS annual microdata has only {audit['raw_rows']} rows; "
                f"minimum is {self.minimum_rows}"
            )
        if any(not record["total_employed"] for record in records):
            raise ValueError("DGBAS microdata is missing one or more civilian occupation groups")

        location = "private local file" if self.local_path else "private versioned S3 object"
        digest = sha256(body).hexdigest()
        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.VERSIONED,
            source_url=REFERENCE_URL,
            dataset_name=f"主計總處人力資源調查個體資料（{self.data_period} 年彙總）",
            reference_url=REFERENCE_URL,
            data_period=str(self.data_period),
            processing_steps=[
                "在受授權環境讀取固定欄位 ASCII；不發布或保存個體列",
                "使用 a3 足歲年齡精確篩選 18–35 歲（含邊界）",
                "使用 a22 主要工作職業，統一為七個職業大類",
                "依 weight 擴大數加權，年資料總和除以 12 取得年平均",
                "分別發布 18–24、25–29、30–35 與 18–35 彙總",
            ],
            fields_used=[
                "a3：足歲年齡",
                "a22：主要工作職業代碼",
                "weight：擴大數",
            ],
            why_used="精確建立 18–35 歲青年在各職業的就業結構，不以五歲組比例拆分邊界年齡。",
            limitations=(
                "受 SRDA／主計總處授權限制，原始個體資料不得轉傳或公開；"
                "公開 API 僅提供七職類加權彙總。"
            ),
            input_count_label="筆受授權個體觀測",
            output_count_label="個 18–35 歲職業彙總",
            retrieved_at=utc_now(),
            content_type="text/plain",
            content_sha256=digest,
            raw_rows=audit["raw_rows"],
            normalized_rows=len(records),
            message=f"Exact age 18–35 aggregation from {location}; raw rows were not persisted.",
        )
        return AdapterResult(snapshot=snapshot, records=records, audit=audit)
