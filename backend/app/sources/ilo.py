from __future__ import annotations

import csv
import math
from collections import Counter, defaultdict
from io import StringIO

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult

ILO_URL = "https://datawrapper.dwcdn.net/x3jzk/13/dataset.csv"
ILO_REFERENCE_URL = (
    "https://www.ilo.org/publications/"
    "generative-ai-and-jobs-refined-global-index-occupational-exposure"
)

EXPOSURE_LEVEL_ORDER = {
    "Not Exposed": 0,
    "Minimal Exposure": 1,
    "Low exposure, high task variability (gradient 1)": 2,
    "Moderate exposure, mixed task variability (gradient 2)": 3,
    "Significant exposure, high task variability (gradient 3)": 4,
    "Highest exposure, low task variability (gradient 4)": 5,
}


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def parse_ilo_csv(body: bytes) -> list[dict[str, object]]:
    text = body.decode("utf-8-sig")
    rows = list(csv.DictReader(StringIO(text)))
    grouped: dict[str, list[tuple[float, str]]] = defaultdict(list)
    names: dict[str, str] = {}
    for row in rows:
        raw_group = row.get("Major groups", "")
        if " - " not in raw_group:
            continue
        code, name = raw_group.split(" - ", 1)
        grouped[code].append((float(row["Average score"]), row["mean_exposure_level"]))
        names[code] = name

    records: list[dict[str, object]] = []
    for code, values in sorted(grouped.items()):
        scores = [item[0] for item in values]
        distribution = Counter(item[1] for item in values)
        modal_level = min(
            distribution,
            key=lambda level: (
                -distribution[level],
                EXPOSURE_LEVEL_ORDER.get(level, 99),
                level,
            ),
        )
        high_count = sum(
            count
            for level, count in distribution.items()
            if "significant exposure" in level.casefold()
            or "highest exposure" in level.casefold()
        )
        records.append(
            {
                "code": code,
                "name": names[code],
                "exposure_score": round(sum(scores) / len(scores), 4),
                "exposure_p90": round(_percentile(scores, 0.9), 4),
                "exposure_level": modal_level,
                "exposure_level_distribution": dict(sorted(distribution.items())),
                "high_exposure_occupation_share": round(high_count / len(values), 4),
                "occupation_count": len(values),
                "weighting": "unweighted detailed ISCO occupations",
            }
        )
    return records


class IloAdapter:
    source_id = "ilo_genai_exposure"

    def __init__(self, http: RetryingHttpClient) -> None:
        self.http = http

    async def fetch(self) -> AdapterResult:
        payload = await self.http.get(ILO_URL)
        records = parse_ilo_csv(payload.body)
        raw_rows = max(payload.body.count(b"\n") - 1, 0)
        snapshot = SourceSnapshot(
            source_id=self.source_id,
            status=FreshnessStatus.LIVE,
            source_url=payload.url,
            dataset_name="ILO 2025 refined occupational GenAI exposure index",
            reference_url=ILO_REFERENCE_URL,
            processing_steps=[
                "解析 426 筆細職業的平均 AI 暴露分數與梯度",
                "依 ISCO major group 對齊職業代碼",
                "將細職業分數彙整為大類平均、P90 與梯度分布",
                "大類標籤採多數梯度，不再取單一最高暴露細職業",
                "保留細職業數與高暴露職業數占比；不解讀為失業機率",
            ],
            fields_used=[
                "Major groups：ISCO 職業大類",
                "Average score：任務可被 GenAI 影響的平均分數",
                "mean_exposure_level：ILO 暴露梯度",
            ],
            why_used=(
                "補上官方就業統計沒有的職務 AI 暴露維度，"
                "用來比較哪些青年集中職業更需要轉型準備。"
            ),
            limitations=(
                "全球職業暴露研究不是台灣失業預測；目前大類平均仍是細職業無權重平均，"
                "尚無台灣細職業就業權重。"
            ),
            input_count_label="個細職業觀測",
            output_count_label="個職業大類",
            retrieved_at=utc_now(),
            source_published_at=None,
            http_status=payload.status_code,
            content_type=payload.content_type,
            content_sha256=payload.sha256,
            raw_rows=raw_rows,
            normalized_rows=len(records),
            message=(
                "ILO 2025 refined occupational exposure dataset; "
                "scores aggregated by major group"
            ),
        )
        return AdapterResult(snapshot=snapshot, records=records, raw_body=payload.body)
