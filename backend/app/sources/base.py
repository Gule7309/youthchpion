from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.models import SourceSnapshot


@dataclass
class AdapterResult:
    snapshot: SourceSnapshot
    records: list[dict[str, Any]] = field(default_factory=list)
    audit: dict[str, Any] = field(default_factory=dict)
    raw_body: bytes | None = None
