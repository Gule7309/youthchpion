"""Amazon Bedrock AgentCore Runtime entrypoint.

Deployment packaging installs the ``aws`` optional dependency. Concrete tool handlers are
wired here by the infrastructure layer so credentials and network policy stay outside prompts.
"""

import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp

from app.evidence_harness.contracts import ResearchRequest


app = BedrockAgentCoreApp()


@app.entrypoint
def invoke(payload: dict) -> dict:
    from app.evidence_harness.runtime import build_evidence_harness

    harness = build_evidence_harness(model_id=os.environ["BEDROCK_MODEL_ID"])
    request = ResearchRequest(
        question=payload["question"],
        locale=payload.get("locale", "zh-TW"),
        max_sources=int(payload.get("max_sources", 12)),
        required_claims=tuple(payload.get("required_claims", ())),
    )
    return harness.run(request).to_dict()


if __name__ == "__main__":
    app.run()
