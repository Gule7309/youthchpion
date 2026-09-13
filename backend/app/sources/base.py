from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
from typing import Any

from app.models import SourceSnapshot


@dataclass
class RawArtifact:
    name: str
    url: str
    content_type: str
    body: bytes

    @property
    def content_sha256(self) -> str:
        return sha256(self.body).hexdigest()


@dataclass
class AdapterResult:
    snapshot: SourceSnapshot
    records: list[dict[str, Any]] = field(default_factory=list)
    audit: dict[str, Any] = field(default_factory=dict)
    raw_body: bytes | None = None
    raw_artifacts: list[RawArtifact] = field(default_factory=list)
