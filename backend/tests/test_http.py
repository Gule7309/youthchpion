import httpx
import pytest

from app.http import RetryingHttpClient


@pytest.mark.asyncio
async def test_redirect_validator_runs_before_following_redirect() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(
            302,
            headers={"Location": "http://169.254.169.254/latest/meta-data"},
            request=request,
        )

    def reject_private_redirect(url: str) -> None:
        raise ValueError(f"blocked: {url}")

    client = RetryingHttpClient(transport=httpx.MockTransport(handler), verify=False)

    with pytest.raises(ValueError, match="169.254.169.254"):
        await client.get("https://doi.org/10.1000/test", redirect_validator=reject_private_redirect)

    assert calls == ["https://doi.org/10.1000/test"]
