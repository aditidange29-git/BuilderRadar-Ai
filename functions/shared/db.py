"""
shared/db.py
DynamoDB helper functions for BuilderRadar AI.

Two responsibilities:
  1. put_raw_item  — atomic conditional write; returns False on duplicate.
  2. update_enriched — write agent-generated fields and flip status.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


def put_raw_item(table: Any, item: dict) -> bool:
    """
    Write a raw scraped item to DynamoDB if it has not been seen before.

    Uses a conditional put_item keyed on `id` so the dedup check and the
    write are a single atomic operation — no separate read needed.

    Args:
        table: boto3 DynamoDB Table resource.
        item:  Dict that MUST include the key `id`.  All other fields are
               written as-is.  `status` and `ingested_at` are added here.

    Returns:
        True  — item was new and has been written.
        False — item already existed (duplicate); nothing was written.

    Raises:
        ClientError for any error OTHER than ConditionalCheckFailedException.
    """
    item = {
        **item,
        "status": "raw",
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        table.put_item(
            Item=item,
            ConditionExpression=Attr("id").not_exists(),
        )
        logger.info("put_raw_item: wrote id=%s", item["id"])
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            logger.info("put_raw_item: duplicate skipped id=%s", item["id"])
            return False
        # Re-raise unexpected errors so the caller can handle/log them
        raise


def update_enriched(table: Any, item_id: str, enrichment: dict) -> None:
    """
    Write AI-enriched fields to an existing opportunity record and set
    status to "enriched".

    Args:
        table:      boto3 DynamoDB Table resource.
        item_id:    The `id` (partition key) of the record to update.
        enrichment: Dict with keys: category, deadline, eligibility,
                    relevance_reason.  Extra keys are silently ignored.

    Raises:
        KeyError    if a required enrichment field is missing.
        ClientError on DynamoDB errors.
    """
    required = {"category", "deadline", "eligibility", "relevance_reason"}
    missing = required - enrichment.keys()
    if missing:
        raise KeyError(f"update_enriched: missing fields {missing}")

    table.update_item(
        Key={"id": item_id},
        UpdateExpression=(
            "SET #cat = :cat, deadline = :dl, eligibility = :elig, "
            "relevance_reason = :rr, #st = :st, enriched_at = :ea"
        ),
        ExpressionAttributeNames={
            "#cat": "category",   # 'category' is not a reserved word but
            "#st": "status",      # 'status' is — alias both for safety
        },
        ExpressionAttributeValues={
            ":cat": enrichment["category"],
            ":dl":  enrichment["deadline"],
            ":elig": enrichment["eligibility"],
            ":rr":  enrichment["relevance_reason"],
            ":st":  "enriched",
            ":ea":  datetime.now(timezone.utc).isoformat(),
        },
    )
    logger.info("update_enriched: id=%s status=enriched", item_id)
