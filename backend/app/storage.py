from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Protocol

from botocore.exceptions import ClientError

from app.config import settings


class SnapshotStore(Protocol):
    def put_json(self, key: str, value: dict[str, Any]) -> None: ...

    def get_json(self, key: str) -> dict[str, Any] | None: ...

    def put_bytes(self, key: str, value: bytes, content_type: str) -> None: ...


class LocalSnapshotStore:
    """Filesystem implementation used locally; keys mirror the production S3 layout."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or settings.data_dir
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents and path != self.root:
            raise ValueError("snapshot key escapes data directory")
        return path

    def put_json(self, key: str, value: dict[str, Any]) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
        )
        os.replace(temporary, path)

    def get_json(self, key: str) -> dict[str, Any] | None:
        path = self._path(key)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def put_bytes(self, key: str, value: bytes, content_type: str) -> None:
        del content_type
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(value)
        os.replace(temporary, path)


class S3SnapshotStore:
    def __init__(self, bucket: str, prefix: str = "") -> None:
        import boto3

        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.client = boto3.client("s3", region_name=settings.aws_region)

    def _key(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key

    def put_json(self, key: str, value: dict[str, Any]) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=self._key(key),
            Body=json.dumps(value, ensure_ascii=False, default=str).encode("utf-8"),
            ContentType="application/json",
            ServerSideEncryption="AES256",
        )

    def get_json(self, key: str) -> dict[str, Any] | None:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=self._key(key))
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                return None
            raise
        return json.loads(response["Body"].read())

    def put_bytes(self, key: str, value: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=self._key(key),
            Body=value,
            ContentType=content_type or "application/octet-stream",
            ServerSideEncryption="AES256",
        )


def create_store() -> SnapshotStore:
    if settings.data_bucket:
        return S3SnapshotStore(settings.data_bucket)
    return LocalSnapshotStore()
