"""
functions/api_handler/handler.py

Lambda handler for GET /opportunities — serves enriched opportunity data
to the frontend dashboard.

Design constraints:
  - NO model calls — pure DynamoDB read, always
  - No agent is ever invoked from this path
  - CORS headers on every response (frontend may be on any origin)
  - Optional ?category= filter (exact match against the category field)
  - Results sorted by posted_date descending, capped at 50

Cost note: DynamoDB scan at this volume (<500 items) costs fractions of
a cent. A GSI would add write costs on every scraper run — not worth it
at MVP scale.
"""

import json
import logging
import os

import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Response fields returned to the frontend ─────────────────────────────────
RESPONSE_FIELDS = {
    "id", "title", "source", "url", "posted_date",
    "deadline", "eligibility", "category", "relevance_reason",
}

# Maximum items returned in a single response
RESULT_CAP = 50

# ── CORS headers — included on every response including errors ────────────────
CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}

# Lazy-initialised DynamoDB resource
_table = None


def _get_table():
    global _table
    if _table is None:
        dynamodb = boto3.resource("dynamodb")
        _table = dynamodb.Table(os.environ["TABLE_NAME"])
    return _table


# ── Response helpers ──────────────────────────────────────────────────────────

def _ok(body: dict) -> dict:
    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps(body),
    }


def _error(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps({"error": message}),
    }


def _project(item: dict) -> dict:
    """Return only the frontend-safe fields from a DynamoDB item."""
    return {k: item.get(k, "") for k in RESPONSE_FIELDS}


# ── DynamoDB scan with pagination ─────────────────────────────────────────────

def scan_enriched(category_filter: str | None) -> list[dict]:
    """
    Scan the opportunities table for status=enriched items.
    Handles DynamoDB pagination automatically.
    Optionally filters by category (exact match).
    """
    table = _get_table()

    # Build filter expression
    filter_expr = Attr("status").eq("enriched")
    if category_filter:
        filter_expr = filter_expr & Attr("category").eq(category_filter)

    items = []
    scan_kwargs = {
        "FilterExpression": filter_expr,
        # Project only fields we need — reduces read bandwidth
        "ProjectionExpression": ", ".join(
            f"#{f}" if f in ("status", "source") else f
            for f in RESPONSE_FIELDS | {"status"}
        ),
        "ExpressionAttributeNames": {
            "#status": "status",
            "#source": "source",
        },
    }

    # Paginate through all results
    while True:
        response = table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    return items


# ── Lambda handler ─────────────────────────────────────────────────────────────

def handler(event, context):
    """
    Lambda entry point.

    Routes:
      OPTIONS /opportunities  → 200 (CORS preflight)
      GET     /opportunities  → list of enriched opportunities
      GET     /opportunities?category=Cloud  → filtered list

    Never calls any model or agent.
    """
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    # Handle CORS preflight
    if http_method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    # Only GET is supported
    if http_method not in ("GET", ""):
        return _error(405, f"Method {http_method} not allowed")

    # Parse optional query parameter
    query_params = event.get("queryStringParameters") or {}
    category_filter = query_params.get("category", "").strip() or None

    valid_categories = {"Cloud", "AI", "Software Engineering", "Open Source"}
    if category_filter and category_filter not in valid_categories:
        return _error(
            400,
            f"Invalid category '{category_filter}'. "
            f"Valid values: {sorted(valid_categories)}",
        )

    logger.info(
        "GET /opportunities — category_filter=%s",
        category_filter or "none",
    )

    try:
        items = scan_enriched(category_filter)
    except Exception as exc:
        logger.error("DynamoDB scan failed: %s", exc, exc_info=True)
        return _error(500, "Failed to retrieve opportunities")

    # Project to response fields and sort by posted_date descending
    results = sorted(
        [_project(item) for item in items],
        key=lambda x: x.get("posted_date", ""),
        reverse=True,
    )[:RESULT_CAP]

    logger.info(
        "Returning %d opportunities (total scanned: %d)",
        len(results), len(items),
    )

    return _ok({
        "opportunities": results,
        "count": len(results),
        "filtered_by": category_filter,
    })
