"""
shared/dedup.py
Deduplication key computation for BuilderRadar AI.

The dedup key is SHA-256( normalize(title) + "|" + source )
where normalize: lowercase, strip, collapse internal whitespace.

This same key is used as the DynamoDB partition key (id),
so a conditional put_item doubles as the dedup check — no
separate read needed.
"""

import hashlib
import re


def normalize(text: str) -> str:
    """Lowercase, strip, and collapse internal whitespace runs."""
    return re.sub(r"\s+", " ", text.strip().lower())


def compute_id(title: str, source: str) -> str:
    """
    Compute a stable, unique ID for an opportunity.

    Args:
        title:  Raw listing title as scraped.
        source: Platform identifier, e.g. "devpost" or "unstop".

    Returns:
        64-character lowercase hex SHA-256 digest.
    """
    key = normalize(title) + "|" + source.strip().lower()
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Smoke test — run directly: python functions/shared/dedup.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Determinism check: same input must always yield the same hash
    id1 = compute_id("  Global AI Hackathon 2025  ", "devpost")
    id2 = compute_id("global ai hackathon 2025", "devpost")
    id3 = compute_id("Global  AI  Hackathon  2025", "devpost")
    assert id1 == id2 == id3, "Normalization is not idempotent!"
    print(f"compute_id (devpost): {id1}")

    # Source differentiation check: same title on different platforms → different ID
    id_unstop = compute_id("Global AI Hackathon 2025", "unstop")
    assert id1 != id_unstop, "Different sources must produce different IDs!"
    print(f"compute_id (unstop):  {id_unstop}")

    print("\nAll smoke tests passed.")
