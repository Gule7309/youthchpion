from __future__ import annotations

import asyncio
import ssl
from collections.abc import Callable
from dataclasses import dataclass
from hashlib import sha256

import httpx
import truststore

from app.config import settings


@dataclass(frozen=True)
class HttpPayload:
    url: str
    status_code: int
    content_type: str
    body: bytes

    @property
    def sha256(self) -> str:
        return sha256(self.body).hexdigest()


class RetryingHttpClient:
    def __init__(
        self,
        transport: httpx.AsyncBaseTransport | None = None,
        verify: bool = True,
    ) -> None:
        self.transport = transport
        self.verify = verify

    async def get(
        self,
        url: str,
        params: dict[str, str | int] | None = None,
        redirect_validator: Callable[[str], None] | None = None,
    ) -> HttpPayload:
        headers = {"User-Agent": "YouthChampion/0.1 (hackathon research dashboard)"}
        ssl_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        last_error: Exception | None = None
        for attempt in range(settings.source_max_retries + 1):
            try:
                async with httpx.AsyncClient(
                    timeout=settings.http_timeout_seconds,
                    follow_redirects=redirect_validator is None,
                    transport=self.transport,
                    headers=headers,
                    verify=ssl_context if self.verify else False,
                ) as client:
                    response = await client.get(url, params=params)
                    redirect_count = 0
                    while redirect_validator is not None and response.is_redirect:
                        redirect_count += 1
                        if redirect_count > 8 or response.next_request is None:
                            raise httpx.TooManyRedirects("evidence redirect limit exceeded")
                        redirect_validator(str(response.next_request.url))
                        response = await client.send(response.next_request)
                    response.raise_for_status()
                    return HttpPayload(
                        url=str(response.url),
                        status_code=response.status_code,
                        content_type=response.headers.get("content-type", ""),
                        body=response.content,
                    )
            except (httpx.HTTPError, TimeoutError) as exc:
                last_error = exc
                if attempt < settings.source_max_retries:
                    await asyncio.sleep(0.25 * (2**attempt))
        assert last_error is not None
        raise last_error
