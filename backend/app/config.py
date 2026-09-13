from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    aws_region: str
    data_bucket: str | None
    ingestion_function_name: str | None
    bedrock_model_id: str | None
    http_timeout_seconds: float
    source_max_retries: int
    bedrock_min_interval_ms: int
    latest_max_stale_hours: int
    dgbas_microdata_local_path: Path | None
    dgbas_microdata_s3_key: str | None
    dgbas_microdata_period: int | None

    @classmethod
    def from_env(cls) -> Settings:
        default_data_dir = Path(__file__).resolve().parents[1] / "var" / "data"
        return cls(
            data_dir=Path(os.getenv("YOUTH_DATA_DIR", default_data_dir)).resolve(),
            aws_region=os.getenv("AWS_DEFAULT_REGION", "us-west-2"),
            data_bucket=os.getenv("DATA_BUCKET") or None,
            ingestion_function_name=(
                os.getenv("INGESTION_FUNCTION_NAME")
                or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
                or None
            ),
            bedrock_model_id=os.getenv("BEDROCK_MODEL_ID") or None,
            http_timeout_seconds=float(os.getenv("HTTP_TIMEOUT_SECONDS", "12")),
            source_max_retries=int(os.getenv("SOURCE_MAX_RETRIES", "2")),
            bedrock_min_interval_ms=int(os.getenv("BEDROCK_MIN_INTERVAL_MS", "1100")),
            latest_max_stale_hours=int(os.getenv("LATEST_MAX_STALE_HOURS", "168")),
            dgbas_microdata_local_path=(
                Path(value).resolve()
                if (value := os.getenv("DGBAS_MICRODATA_LOCAL_PATH"))
                else None
            ),
            dgbas_microdata_s3_key=os.getenv("DGBAS_MICRODATA_S3_KEY") or None,
            dgbas_microdata_period=(
                int(value)
                if (value := os.getenv("DGBAS_MICRODATA_PERIOD"))
                else None
            ),
        )


settings = Settings.from_env()
