"""
agent/agent.py

BuilderRadar Strands agent — wrapped for Bedrock AgentCore Runtime.

Deployment path:
  1. Local dev:   agentcore dev  (starts uvicorn on :8080)
  2. Test locally: agentcore invoke --dev '{"prompt": "Process these opportunity IDs: [\\"abc\\"]"}'
  3. Deploy:      agentcore configure --entrypoint agent/agent.py --non-interactive
                  agentcore launch

The BedrockAgentCoreApp wrapper exposes the /invocations HTTP endpoint
that AgentCore Runtime expects. The @app.entrypoint decorator marks
the function that receives each invocation payload.

Cost note: Nova Micro is the cheapest Bedrock model available.
At ≤4 items per run, model cost is <$0.001/day.
"""

import logging
import os

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel

from tools import get_opportunity, save_enrichment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── AgentCore app wrapper ─────────────────────────────────────────────────────
app = BedrockAgentCoreApp()

# ── Model — Nova Micro (cheapest), Nova Lite as env-var override ──────────────
_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-micro-v1:0")
_REGION = os.environ.get("AWS_REGION", "us-east-1")

# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are BuilderRadar, an AI assistant that analyzes student \
opportunity listings (hackathons, competitions, open source programs).

Student profile you are personalizing for:
- AWS/cloud-focused builder
- Serverless project experience (Lambda, DynamoDB, API Gateway, EventBridge)
- Python and React skills
- University student looking for relevant competitions and programs

For EACH opportunity ID in the list you receive, follow these steps in order:

1. Call get_opportunity(id) to retrieve the listing details.
2. Classify it into EXACTLY ONE category from this fixed list:
   Cloud | AI | Software Engineering | Open Source
   Use the title and raw_description to decide. When in doubt, pick the
   closest match — do not invent new categories.
3. Extract the application deadline as YYYY-MM-DD. If not found, use "unknown".
4. Extract eligibility as a short plain-English phrase
   (e.g. "Open to university students globally"). If not found, use "unknown".
5. Write ONE sentence (max 25 words) explaining why this opportunity is
   relevant to the student profile above. Be specific — mention a skill or
   technology from the profile that matches the opportunity.
6. Call save_enrichment(id, category, deadline, eligibility, relevance_reason)
   to persist your results.

Process every ID fully before moving on. Never skip step 6.
If get_opportunity returns an empty dict, log a warning and move to the next ID.
"""


# ── AgentCore entrypoint ──────────────────────────────────────────────────────

@app.entrypoint
def process_opportunities(payload: dict) -> dict:
    """
    Entrypoint called by AgentCore Runtime for each invocation.

    Expected payload shape (sent by agent_trigger Lambda):
        {"prompt": "Process these opportunity IDs: [\"abc123\", \"def456\"]"}

    Returns:
        {"response": "<agent reply text>"}
    """
    prompt = payload.get("prompt", "")
    if not prompt:
        logger.warning("process_opportunities: empty prompt received")
        return {"response": "No prompt provided — nothing to process."}

    logger.info("process_opportunities: prompt=%s", prompt[:120])

    # Build a fresh Agent for each invocation — stateless by design.
    # (No conversation history needed; each run is independent.)
    model = BedrockModel(
        model_id=_MODEL_ID,
        region_name=_REGION,
        # Keep temperature low — classification is a factual task
        temperature=0.1,
        max_tokens=2048,
    )

    agent = Agent(
        model=model,
        tools=[get_opportunity, save_enrichment],
        system_prompt=SYSTEM_PROMPT,
    )

    try:
        response = agent(prompt)
        response_text = str(response)
        logger.info("Agent completed. Response length: %d chars", len(response_text))
        return {"response": response_text}
    except Exception as exc:
        logger.error("Agent invocation failed: %s", exc, exc_info=True)
        return {"response": f"Agent error: {exc}"}


# ── Local entry point (for agentcore dev) ────────────────────────────────────
if __name__ == "__main__":
    # agentcore dev uses uvicorn to serve `app` — this block is for
    # manual local testing only
    import json
    test_payload = {"prompt": 'Process these opportunity IDs: ["test-id-001"]'}
    result = process_opportunities(test_payload)
    print(json.dumps(result, indent=2))
