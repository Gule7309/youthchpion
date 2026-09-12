from __future__ import annotations

import csv
from collections import defaultdict
from io import StringIO

from app.http import RetryingHttpClient
from app.models import FreshnessStatus, SourceSnapshot, utc_now
from app.sources.base import AdapterResult

ILO_URL = "https://datawrapper.dwcdn.net/x3jzk/13/dataset.csv"


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
        score = round(sum(item[0] for item in values) / len(values), 4)
        highest = max(values, key=lambda item: item[0])[1]
        records.append(
            {
                "code": code,
                "name": names[code],
                "exposure_score": score,
                "exposure_level": highest,
                "occupation_count": len(values),
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
