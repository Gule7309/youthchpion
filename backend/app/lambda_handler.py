from __future__ import annotations

import asyncio
from typing import Any

from mangum import Mangum

from app.main import app, pipeline

asgi_handler = Mangum(app, lifespan="off")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    if "requestContext" in event:
        return asgi_handler(event, context)
    run_id = event.get("run_id")
    if run_id:
        run = pipeline.get_run(run_id)
        if run is None:
            return {"run_id": run_id, "status": "FAILED", "error": "run_not_found"}
        pipeline.runs[run_id] = run
    else:
        run = pipeline.create_run(trigger="scheduled")
    # Keep a current loop for Mangum when a warm Lambda handles HTTP after a
    # scheduled invocation. asyncio.run() would close and clear the loop.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(pipeline.execute(run.run_id))
    finished = pipeline.get_run(run.run_id)
    return {
        "run_id": run.run_id,
        "status": str(finished.status) if finished else "FAILED",
    }
