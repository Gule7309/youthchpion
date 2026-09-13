from __future__ import annotations

import pytest

from app.http import RetryingHttpClient
from app.sources.dgbas import DgbasAdapter
from app.sources.ilo import IloAdapter
from app.sources.job104 import Job104Adapter
from app.sources.moda_public_opinion import ModaPublicOpinionAdapter
from app.sources.taiwanjobs import TaiwanJobsAdapter
from app.sources.vacancy_history import VacancyHistoryAdapter


@pytest.mark.live
@pytest.mark.parametrize(
    "adapter",
    [
        DgbasAdapter(RetryingHttpClient(verify=False)),
        IloAdapter(RetryingHttpClient()),
        TaiwanJobsAdapter(RetryingHttpClient(), count=5, jobnos=("01",)),
        Job104Adapter(RetryingHttpClient()),
        VacancyHistoryAdapter(RetryingHttpClient()),
        ModaPublicOpinionAdapter(RetryingHttpClient()),
    ],
)
async def test_live_source_contract(adapter: object) -> None:
    result = await adapter.fetch()  # type: ignore[attr-defined]

    assert result.snapshot.http_status == 200
    assert result.snapshot.content_sha256
    assert result.snapshot.raw_rows > 0
    assert result.snapshot.normalized_rows > 0
