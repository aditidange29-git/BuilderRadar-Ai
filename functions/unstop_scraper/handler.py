"""
functions/unstop_scraper/handler.py

Lambda handler — scrapes Unstop for the 2 most recently posted hackathons,
deduplicates against DynamoDB, writes new raw items, and emits an
EventBridge event if anything new was found.

Unstop exposes a public JSON API at /api/list/hackathon that returns
structured data — preferred over HTML parsing. Falls back to HTML
scraping if the API response is unexpected.

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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.dedup import compute_id
from shared.db import put_raw_item

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Constants ────────────────────────────────────────────────────────────────
# Unstop public API — returns JSON with hackathon listings sorted by recency
UNSTOP_API_URL = (
    "https://unstop.com/api/public/opportunity/search-result"
    "?opportunity=hackathon&per_page=5&page=1&sort_by=RELEVANCE"
)
# Fallback HTML page if the API shape changes
UNSTOP_HTML_URL = "https://unstop.com/hackathons"

HARD_CAP = 2
MAX_RETRIES = 2

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://unstop.com/hackathons",
}

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


# ── Scraping — JSON API path ──────────────────────────────────────────────────

def fetch_via_api() -> list[dict] | None:
    """
    Try the Unstop JSON API first. Returns a list of items or None if the
    response doesn't match the expected shape (caller falls back to HTML).
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(UNSTOP_API_URL, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            break
        except requests.RequestException as exc:
            logger.warning("Unstop API attempt %d/%d failed: %s", attempt, MAX_RETRIES, exc)
            if attempt == MAX_RETRIES:
                return None

    content_type = resp.headers.get("Content-Type", "")
    if "application/json" not in content_type:
        logger.info("Unstop API returned non-JSON (%s) — will try HTML fallback", content_type)
        return None

    try:
        data = resp.json()
    except ValueError:
        logger.warning("Unstop API: could not parse JSON response")
        return None

    # Unstop API shape (observed): { "data": { "data": [ {...}, ... ] } }
    # Try multiple known paths defensively
    listings_raw = (
        data.get("data", {}).get("data")
        or data.get("data")
        or data.get("items")
        or (data if isinstance(data, list) else None)
    )

    if not listings_raw or not isinstance(listings_raw, list):
        logger.warning("Unstop API: unexpected response shape — keys: %s", list(data.keys()))
        return None

    logger.info("Unstop API: received %d listings, capping at %d", len(listings_raw), HARD_CAP)

    items = []
    for raw in listings_raw[:HARD_CAP]:
        item = _parse_api_item(raw)
        if item:
            items.append(item)

    return items


def _parse_api_item(raw: dict) -> dict | None:
    """Map a single Unstop API result dict to our standard item shape."""
    try:
        title = (
            raw.get("title")
            or raw.get("name")
            or raw.get("opportunity_title")
            or ""
        ).strip()
        if not title:
            logger.warning("Unstop API item missing title, skipping")
            return None

        # URL — build canonical Unstop link from slug/id
        slug = raw.get("seo_url") or raw.get("slug") or raw.get("id") or ""
        url = f"https://unstop.com/{slug}" if slug else "https://unstop.com/hackathons"
        if str(slug).isdigit():
            url = f"https://unstop.com/hackathons/hackathon-{slug}"

        # Dates — Unstop API uses start_date / published_at / created_at
        posted_date = (
            raw.get("published_at")
            or raw.get("created_at")
            or raw.get("start_date")
            or ""
        )
        if posted_date:
            posted_date = posted_date[:10]   # keep YYYY-MM-DD portion only

        # Description
        raw_description = (
            raw.get("description")
            or raw.get("tagline")
            or raw.get("short_description")
            or ""
        ).strip()

        return {
            "title": title,
            "source": "unstop",
            "url": url,
            "posted_date": posted_date,
            "raw_description": raw_description,
            "deadline": "",
            "eligibility": "",
        }
    except Exception as exc:
        logger.warning("Unstop API item parse error: %s", exc, exc_info=True)
        return None


# ── Scraping — HTML fallback path ─────────────────────────────────────────────

def fetch_via_html() -> list[dict]:
    """
    HTML fallback — parse Unstop hackathon listing page with BeautifulSoup.
    Returns at most HARD_CAP items.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(UNSTOP_HTML_URL, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            break
        except requests.RequestException as exc:
            logger.warning("Unstop HTML attempt %d/%d failed: %s", attempt, MAX_RETRIES, exc)
            if attempt == MAX_RETRIES:
                raise

    soup = BeautifulSoup(resp.text, "html.parser")

    # Unstop renders competition cards — selectors may need updating if markup changes
    cards = (
        soup.select("div.single_competition")
        or soup.select("div.opportunity-card")
        or soup.select("app-competition-card")
        or soup.select("div[class*='competition']")
    )

    if not cards:
        logger.warning(
            "Unstop HTML: no cards found — page may be JS-rendered (SPA). "
            "Response length: %d chars", len(resp.text)
        )
        return []

    logger.info("Unstop HTML: found %d cards, capping at %d", len(cards), HARD_CAP)

    items = []
    for card in cards[:HARD_CAP]:
        item = _parse_html_card(card)
        if item:
            items.append(item)
    return items


def _parse_html_card(card) -> dict | None:
    """Extract fields from a single Unstop HTML card element."""
    try:
        title_el = (
            card.select_one("h2")
            or card.select_one("h3")
            or card.select_one(".title")
            or card.select_one("[class*='title']")
        )
        title = title_el.get_text(strip=True) if title_el else None
        if not title:
            return None

        link_el = card.select_one("a[href]")
        url = link_el["href"] if link_el else ""
        if url and not url.startswith("http"):
            url = "https://unstop.com" + url

        time_el = card.select_one("time[datetime]")
        posted_date = time_el["datetime"][:10] if time_el else ""

        desc_el = card.select_one("p") or card.select_one(".description")
        raw_description = desc_el.get_text(strip=True) if desc_el else ""

        return {
            "title": title,
            "source": "unstop",
            "url": url,
            "posted_date": posted_date,
            "raw_description": raw_description,
            "deadline": "",
            "eligibility": "",
        }
    except Exception as exc:
        logger.warning("Unstop HTML card parse error: %s", exc, exc_info=True)
        return None


# ── Fetch listings (API → HTML fallback) ──────────────────────────────────────

def fetch_listings() -> list[dict]:
    """Try API first; fall back to HTML if API returns nothing usable."""
    items = fetch_via_api()
    if items is not None:
        return items
    logger.info("Unstop: falling back to HTML scraping")
    return fetch_via_html()


# ── EventBridge ───────────────────────────────────────────────────────────────

def emit_new_opportunities(new_ids: list[str]) -> None:
    events_client = _get_events_client()
    event_bus = os.environ.get("EVENT_BUS_NAME", "default")

    events_client.put_events(
        Entries=[
            {
                "Source": "builderradar.ingestion",
                "DetailType": "NewOpportunities",
                "Detail": json.dumps({"ids": new_ids, "platform": "unstop"}),
                "EventBusName": event_bus,
            }
        ]
    )
    logger.info("EventBridge: emitted NewOpportunities with ids=%s", new_ids)


# ── Lambda handler ─────────────────────────────────────────────────────────────

def handler(event, context):
    """Lambda entry point — ignores the EventBridge cron payload."""
    logger.info("Unstop scraper started")

    summary = {
        "platform": "unstop",
        "attempted": 0,
        "written": 0,
        "skipped_duplicate": 0,
        "errors": 0,
        "new_ids": [],
    }

    try:
        listings = fetch_listings()
    except Exception as exc:
        logger.error("Unstop fetch failed: %s", exc, exc_info=True)
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
            logger.error(
                "Error processing listing '%s': %s",
                listing.get("title"), exc, exc_info=True,
            )
            summary["errors"] += 1

    if summary["new_ids"]:
        try:
            emit_new_opportunities(summary["new_ids"])
        except Exception as exc:
            logger.error("EventBridge emit failed: %s", exc, exc_info=True)
            summary["errors"] += 1
    else:
        logger.info("No new items — EventBridge event suppressed (cost guardrail)")

    logger.info(
        "Unstop scraper complete: attempted=%d written=%d skipped=%d errors=%d",
        summary["attempted"], summary["written"],
        summary["skipped_duplicate"], summary["errors"],
    )
    return {"statusCode": 200, "body": summary}
