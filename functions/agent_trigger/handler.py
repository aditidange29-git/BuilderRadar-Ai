"""
functions/agent_trigger/handler.py

Lambda handler — receives the EventBridge NewOpportunities event emitted
by the scrapers and invokes the BuilderRadar Strands agent deployed on
Bedrock AgentCore Runtime.

This Lambda is the bridge between the ingestion pipeline and the agent.
It does NOT run the agent inline — it invokes the deployed AgentCore
agent via the Bedrock Agent Runtime API.

Cost guardrail: only triggered when scrapers find genuinely new items
(the scrapers suppress the event when nothing new was found).
Hard cap: processes at most AGENT_ITEM_CAP IDs per invocation.
"""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Hard cap matching the design spec: 2 platforms × 2 items = 4 max
AGENT_ITEM_CAP = int(os.environ.get("AGENT_ITEM_CAP", "4"))

# Lazy-initialised clients
_bedrock_agent_runtime = None


def _get_bedrock_agent_runtime():
    global _bedrock_agent_runtime
    if _bedrock_agent_runtime is None:
        region = os.environ.get("AWS_REGION", "us-east-1")
        _bedrock_agent_runtime = boto3.client(
            "bedrock-agent-runtime", region_name=region
        )
    return _bedrock_agent_runtime


def handler(event, context):
    """
    Lambda entry point.

    EventBridge delivers:
    {
      "source": "builderradar.ingestion",
      "detail-type": "NewOpportunities",
      "detail": {
        "ids": ["abc123", "def456"],
        "platform": "devpost"
      }
    }
    """
    logger.info("Agent trigger received event: %s", json.dumps(event))

    # ── Extract IDs ───────────────────────────────────────────────────────
    detail = event.get("detail", {})
    ids = detail.get("ids", [])

    if not ids:
        logger.info("No IDs in event detail — nothing to process")
        return {"statusCode": 200, "body": "no_ids"}

    # Enforce hard cap — log a warning if someone accidentally sends more
    if len(ids) > AGENT_ITEM_CAP:
        logger.warning(
            "Received %d IDs but cap is %d — truncating to first %d",
            len(ids), AGENT_ITEM_CAP, AGENT_ITEM_CAP,
        )
        ids = ids[:AGENT_ITEM_CAP]

    platform = detail.get("platform", "unknown")
    logger.info("Processing %d new item(s) from %s: %s", len(ids), platform, ids)

    # ── Build agent prompt ────────────────────────────────────────────────
    prompt = f"Process these opportunity IDs: {json.dumps(ids)}"

    # ── Invoke AgentCore agent ────────────────────────────────────────────
    agent_id = os.environ.get("AGENTCORE_AGENT_ID")
    agent_alias_id = os.environ.get("AGENTCORE_AGENT_ALIAS_ID", "TSTALIASID")
    session_id = f"builderradar-{context.aws_request_id}"

    if not agent_id:
        logger.error(
            "AGENTCORE_AGENT_ID env var not set — cannot invoke agent. "
            "Deploy the agent with 'agentcore launch' and set this variable."
        )
        return {"statusCode": 500, "body": "AGENTCORE_AGENT_ID not configured"}

    try:
        client = _get_bedrock_agent_runtime()
        logger.info(
            "Invoking AgentCore agent_id=%s alias=%s session=%s",
            agent_id, agent_alias_id, session_id,
        )

        # InvokeAgent returns a streaming response — collect all chunks
        response = client.invoke_agent(
            agentId=agent_id,
            agentAliasId=agent_alias_id,
            sessionId=session_id,
            inputText=prompt,
        )

        # Consume the event stream to get the full response text
        full_response = ""
        event_stream = response.get("completion", [])
        for chunk_event in event_stream:
            chunk = chunk_event.get("chunk", {})
            chunk_bytes = chunk.get("bytes", b"")
            if chunk_bytes:
                full_response += chunk_bytes.decode("utf-8")

        logger.info(
            "Agent invocation complete. Response length: %d chars",
            len(full_response),
        )
        return {
            "statusCode": 200,
            "body": {
                "ids_processed": ids,
                "platform": platform,
                "agent_response_length": len(full_response),
            },
        }

    except Exception as exc:
        logger.error("AgentCore invocation failed: %s", exc, exc_info=True)
        # Re-raise so EventBridge retries (default: 3 attempts with backoff)
        raise
