"""
functions/devpost_scraper/handler.py

Lambda handler — scrapes Devpost for the 2 most recently posted hackathons,
deduplicates against DynamoDB, writes new raw items, and emits an
EventBridge event if anything new was found.

Hard cap: exactly 2 items per run, sorted newest-first.
Cost guardrail: zero EventBridge events emitted when no new items exist.
"""

import json
import logging
import os
import sys

import boto3
import requests
from bs4 import BeautifulSoup

# Allow importing from sibling 'shared' package when running inside Lambda
# (SAM copies both directories into the function's root)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.dedup import compute_id
from shared.db import put_raw_item

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Constants ────────────────────────────────────────────────────────────────
DEVPOST_URL = "https://devpost.com/hackathons?order_by=recently-added&status=upcoming"
HARD_CAP = 2          # never process more than this many items per run
MAX_RETRIES = 2       # HTTP retries before giving up

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ── AWS clients (initialised outside handler for Lambda warm-start reuse) ───
_dynamodb = None
_events = None


def _get_table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb")
    return _dynamodb.Table(os.environ["TABLE_NAME"])


def _get_events_client():
    global _events
    if _events is None:
        _events = boto3.client("events")
    return _events


# ── Scraping ─────────────────────────────────────────────────────────────────

def fetch_listings() -> list[dict]:
    """
    Fetch the Devpost hackathons listing page and extract the top HARD_CAP
    items sorted by recently-added (Devpost's default for this URL).

    Returns a list of dicts with keys:
        title, source, url, posted_date, raw_description
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(DEVPOST_URL, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            break
        except requests.RequestException as exc:
            logger.warning("Devpost fetch attempt %d/%d failed: %s", attempt, MAX_RETRIES, exc)
            if attempt == MAX_RETRIES:
                raise
    
    soup = BeautifulSoup(resp.text, "html.parser")
    
    # Devpost renders hackathon cards as <li> inside #hackathons-container
    # Each card has class "hackathon-tile" or similar — adapt selectors if
    # Devpost changes their markup.
    cards = soup.select("li.hackathon-tile, article.hackathon-tile, div.hackathon-tile")
    
    if not cards:
        # Fallback: try generic software listing cards
        cards = soup.select(".challenge-listing")
    
    if not cards:
        logger.warning(
            "Devpost: no hackathon cards found — page structure may have changed. "
            "Response length: %d chars", len(resp.text)
        )
        return []
    
    logger.info("Devpost: found %d total cards, capping at %d", len(cards), HARD_CAP)
    
    items = []
    for card in cards[:HARD_CAP]:   # ← hard cap enforced here
        item = _parse_card(card)
        if item:
            items.append(item)
    
    return items


def _parse_card(card) -> dict | None:
    """Extract fields from a single hackathon card element."""
    try:
        # Title
        title_el = (
            card.select_one("h2.title")
            or card.select_one(".challenge-title")
            or card.select_one("h2")
            or card.select_one("h3")
        )
        title = title_el.get_text(strip=True) if title_el else None
        if not title:
            logger.warning("Devpost card missing title, skipping")
            return None

        # URL — prefer <a> with href pointing to devpost
        link_el = card.select_one("a[href]")
        url = link_el["href"] if link_el else ""
        if url and not url.startswith("http"):
            url = "https://devpost.com" + url

        # Posted / submission date — Devpost uses <time> tags
        time_el = card.select_one("time[datetime]")
        posted_date = time_el["datetime"][:10] if time_el else ""

        # Short description
        desc_el = (
            card.select_one(".challenge-description")
            or card.select_one("p.tagline")
            or card.select_one("p")
        )
        raw_description = desc_el.get_text(strip=True) if desc_el else ""

        return {
            "title": title,
            "source": "devpost",
            "url": url,
            "posted_date": posted_date,
            "raw_description": raw_description,
            # deadline and eligibility left blank — agent fills these
            "deadline": "",
            "eligibility": "",
        }
    except Exception as exc:
        logger.warning("Devpost card parse error: %s", exc, exc_info=True)
        return None


# ── EventBridge ───────────────────────────────────────────────────────────────

def emit_new_opportunities(new_ids: list[str]) -> None:
    """Publish a single EventBridge event listing all new item IDs."""
    events_client = _get_events_client()
    event_bus = os.environ.get("EVENT_BUS_NAME", "default")
    
    events_client.put_events(
        Entries=[
            {
                "Source": "builderradar.ingestion",
                "DetailType": "NewOpportunities",
                "Detail": json.dumps({"ids": new_ids, "platform": "devpost"}),
                "EventBusName": event_bus,
            }
        ]
    )
    logger.info("EventBridge: emitted NewOpportunities event with ids=%s", new_ids)


# ── Lambda handler ─────────────────────────────────────────────────────────

def handler(event, context):
    """
    Lambda entry point.

    EventBridge schedule passes a cron event; we ignore its content.
    Returns a summary dict (visible in Lambda test console and CloudWatch).
    """
    logger.info("Devpost scraper started")
    
    summary = {
        "platform": "devpost",
        "attempted": 0,
        "written": 0,
        "skipped_duplicate": 0,
        "errors": 0,
        "new_ids": [],
    }
    
    try:
        listings = fetch_listings()
    except Exception as exc:
        logger.error("Devpost fetch failed: %s", exc, exc_info=True)
        summary["errors"] += 1
        return {"statusCode": 500, "body": summary}
    
    summary["attempted"] = len(listings)
    table = _get_table()
    
    for listing in listings:
        try:
            listing["id"] = compute_id(listing["title"], listing["source"])
            written = put_raw_item(table, listing)
            if written:
                summary["written"] += 1
                summary["new_ids"].append(listing["id"])
                logger.info("Written: %s | %s", listing["id"][:8], listing["title"])
            else:
                summary["skipped_duplicate"] += 1
        except Exception as exc:
            logger.error("Error processing listing '%s': %s", listing.get("title"), exc, exc_info=True)
            summary["errors"] += 1
    
    # Only wake up the agent if there is genuinely new data
    if summary["new_ids"]:
        try:
            emit_new_opportunities(summary["new_ids"])
        except Exception as exc:
            logger.error("EventBridge emit failed: %s", exc, exc_info=True)
            summary["errors"] += 1
    else:
        logger.info("No new items — EventBridge event suppressed (cost guardrail)")
    
    logger.info(
        "Devpost scraper complete: attempted=%d written=%d skipped=%d errors=%d",
        summary["attempted"], summary["written"],
        summary["skipped_duplicate"], summary["errors"],
    )
    return {"statusCode": 200, "body": summary}
