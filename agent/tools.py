"""
agent/tools.py

Strands @tool functions given to the BuilderRadar agent.

These are the ONLY two DynamoDB operations the agent needs:
  - get_opportunity  — fetch a raw record for the agent to read
  - save_enrichment  — write the agent's structured output back

Both functions read TABLE_NAME from the environment so they work
identically whether the agent runs locally (agentcore dev) or in
the AgentCore cloud runtime.
"""

import logging
import os

import boto3
from strands import tool

logger = logging.getLogger(__name__)

# Lazy-initialised so the module can be imported without AWS credentials
_table = None


def _get_table():
    global _table
    if _table is None:
        dynamodb = boto3.resource("dynamodb")
        _table = dynamodb.Table(os.environ["TABLE_NAME"])
    return _table


# ── Tool 1: read ──────────────────────────────────────────────────────────────

@tool
def get_opportunity(id: str) -> dict:
    """Fetch a raw opportunity record from DynamoDB by its ID.

    Call this first for every ID you are asked to process. The record
    contains the title, URL, source platform, and raw_description needed
    for classification and enrichment.

    Args:
        id: The SHA-256 hash ID of the opportunity to retrieve.

    Returns:
        A dict with keys: id, title, source, url, posted_date,
        raw_description. Returns an empty dict if the record is not found.
    """
    try:
        response = _get_table().get_item(Key={"id": id})
        item = response.get("Item")
        if not item:
            logger.warning("get_opportunity: id=%s not found", id)
            return {}

        # Return only the fields the agent needs — no status internals
        return {
            "id": item.get("id", ""),
            "title": item.get("title", ""),
            "source": item.get("source", ""),
            "url": item.get("url", ""),
            "posted_date": item.get("posted_date", ""),
            "raw_description": item.get("raw_description", ""),
        }
    except Exception as exc:
        logger.error("get_opportunity error id=%s: %s", id, exc, exc_info=True)
        return {}


# ── Tool 2: write ─────────────────────────────────────────────────────────────

@tool
def save_enrichment(
    id: str,
    category: str,
    deadline: str,
    eligibility: str,
    relevance_reason: str,
) -> str:
    """Save AI-enriched fields to DynamoDB and mark the opportunity as enriched.

    Call this after you have determined the category, deadline, eligibility,
    and relevance_reason for an opportunity. This is the final step for each
    record — do not skip it.

    Args:
        id: The SHA-256 hash ID of the opportunity (same value returned by
            get_opportunity).
        category: Exactly one of: Cloud, AI, Software Engineering, Open Source.
            Choose the single best fit based on the title and description.
        deadline: Application deadline as YYYY-MM-DD (ISO 8601). Use the string
            "unknown" if no deadline is mentioned anywhere in the description.
        eligibility: A brief plain-English phrase describing who can apply,
            e.g. "Open to university students globally" or "US residents only".
            Use "unknown" if not stated.
        relevance_reason: One sentence (max 25 words) explaining why this
            opportunity is relevant to a student with AWS/serverless/Python/React
            experience who is building cloud projects.

    Returns:
        "success" on successful save, or "error: <message>" if the save failed.
    """
    # Validate category against the allowed set
    valid_categories = {"Cloud", "AI", "Software Engineering", "Open Source"}
    if category not in valid_categories:
        # Attempt a case-insensitive fix before rejecting
        fixed = next(
            (c for c in valid_categories if c.lower() == category.strip().lower()),
            None,
        )
        if fixed:
            category = fixed
        else:
            return f"error: invalid category '{category}'. Must be one of {sorted(valid_categories)}"

    try:
        from datetime import datetime, timezone

        _get_table().update_item(
            Key={"id": id},
            UpdateExpression=(
                "SET #cat = :cat, deadline = :dl, eligibility = :elig, "
                "relevance_reason = :rr, #st = :st, enriched_at = :ea"
            ),
            ExpressionAttributeNames={
                "#cat": "category",
                "#st": "status",
            },
            ExpressionAttributeValues={
                ":cat": category,
                ":dl": deadline,
                ":elig": eligibility,
                ":rr": relevance_reason,
                ":st": "enriched",
                ":ea": datetime.now(timezone.utc).isoformat(),
            },
        )
        logger.info("save_enrichment: id=%s category=%s", id, category)
        return "success"
    except Exception as exc:
        logger.error("save_enrichment error id=%s: %s", id, exc, exc_info=True)
        return f"error: {exc}"
