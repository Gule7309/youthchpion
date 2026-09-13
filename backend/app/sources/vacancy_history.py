from __future__ import annotations

import json
import re
from collections import defaultdict
from typing import Any

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult

VACANCY_HISTORY_URL = (
    "https://apiservice.mol.gov.tw/OdService/download/A17000000J-030281-UAk"
)
VACANCY_HISTORY_REFERENCE_URL = "https://data.gov.tw/dataset/146549"

OCCUPATION_CODE = {
    "民意代表、主管及經理人員": "1",
    "專業人員": "2",
    "技術員及助理專業人員": "3",
    "事務支援人員": "4",
    "服務及銷售工作人員": "5",
    "農、林、漁、牧業生產人員": "6",
    "技藝有關工作人員": "7-9",
    "機械設備操作及組裝人員": "7-9",
    "基層技術工及勞力工及其他": "7-9",
}


def _calendar_year(value: str) -> int:
    match = re.fullmatch(r"(\d{3})年", value.strip())
    if not match:
        raise ValueError(f"unexpected MOL vacancy period: {value}")
    return int(match.group(1)) + 1911


def _change(current: int, previous: int | None) -> float | None:
    if previous in (None, 0):
        return None
    return (current - previous) / previous


def _weakening(change: float | None, threshold: float) -> float | None:
    if change is None:
        return None
    return min(max(-change / threshold, 0.0), 1.0)


def parse_vacancy_history(body: bytes) -> list[dict[str, Any]]:
    rows = json.loads(body)
    if not isinstance(rows, list):
        raise ValueError("MOL vacancy history must be a JSON list")
    grouped: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in rows:
        year = _calendar_year(str(row.get("統計期", "")))
        code = OCCUPATION_CODE.get(str(row.get("職業別", "")).strip())
        if code is None:
            continue
        grouped[year][code] += int(row.get("新登記求才人數（人次）", 0))
    if len(grouped) < 2:
        raise ValueError("MOL vacancy history requires at least two periods")

    latest = max(grouped)
    previous = latest - 1
    if previous not in grouped:
        raise ValueError(f"MOL vacancy history is missing comparison period {previous}")
    three_year_base = latest - 3
    records: list[dict[str, Any]] = []
    for code in ("1", "2", "3", "4", "5", "6", "7-9"):
        current_value = grouped[latest].get(code)
        previous_value = grouped[previous].get(code)
        if current_value is None or previous_value is None:
            raise ValueError(f"MOL vacancy history is missing occupation {code}")
        yoy = _change(current_value, previous_value)
        three_year = _change(current_value, grouped.get(three_year_base, {}).get(code))
        records.append(
            {
                "code": code,
                "period": latest,
                "previous_period": previous,
                "new_vacancies": current_value,
                "previous_new_vacancies": previous_value,
                "yoy_change": round(yoy, 6) if yoy is not None else None,
                "three_year_change": round(three_year, 6) if three_year is not None else None,
                "recruitment_weakening": (
                    round(_weakening(yoy, 0.2), 6) if yoy is not None else None
                ),
                "weakening_sensitivity": {
                    str(threshold): round(_weakening(yoy, threshold), 6)
                    if yoy is not None
                    else None
                    for threshold in (0.1, 0.2, 0.3)
                },
            }
        )
    return records


class VacancyHistoryAdapter:
    source_id = "mol_vacancy_history"

    def __init__(self, http: RetryingHttpClient) -> None:
        self.http = http

    async def fetch(self) -> AdapterResult:
        payload = await self.http.get(VACANCY_HISTORY_URL)
        rows = json.loads(payload.body)
        records = parse_vacancy_history(payload.body)
        data_period = max(int(record["period"]) for record in records)
        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.LIVE,
            source_url=payload.url,
            dataset_name="勞動部就業服務新登記求才人數按職業分",
            reference_url=VACANCY_HISTORY_REFERENCE_URL,
            data_period=str(data_period),
            processing_steps=[
                "將民國年轉為西元年並驗證相鄰比較年度",
                "依官方九大職業彙整；7、8、9 類先合計人次再計算比率",
                "計算新登記求才人次年增率與三年變化",
                "H 為獨立招募弱化訊號；同時保留 10%、20%、30% 門檻敏感度",
            ],
            fields_used=[
                "統計期：年度與可比序列",
                "職業別：官方職業大類",
                "新登記求才人數（人次）：H 的原始值",
            ],
            why_used="用與 AI 職缺 D 獨立的官方歷史序列衡量整體招募是否弱化。",
            limitations=(
                "這是公立就業服務新登記求才人次，不是全市場、非青年專屬，"
                "也不能將下降歸因於 AI。20% clip 只是待校準的早期預警參數。"
            ),
            input_count_label="筆年度×職業觀測",
            output_count_label="個職業大類變化指標",
            retrieved_at=utc_now(),
            http_status=payload.status_code,
            content_type=payload.content_type,
            content_sha256=payload.sha256,
            raw_rows=len(rows),
            normalized_rows=len(records),
            message=f"Official annual vacancy series through {data_period}",
        )
        return AdapterResult(
            snapshot=snapshot,
            records=records,
            audit={
                "data_period": data_period,
                "comparison_period": data_period - 1,
                "weakening_thresholds": [0.1, 0.2, 0.3],
            },
            raw_body=payload.body,
        )
