# BuilderRadar AI — Requirements

## 1. Project Overview

BuilderRadar AI is a student opportunity-discovery system that automatically scrapes hackathon and competition listings from Devpost and Unstop, deduplicates them, enriches each new listing using an AI agent, and exposes the results through a read-only API for a frontend dashboard.

**Design philosophy:** Every decision optimizes for lowest AWS cost over performance or scale. This is a solo student project with a near-zero budget target.

---

## 2. Functional Requirements

### 2.1 Scraping (FR-SCRAPE)

| ID | Requirement |
|----|-------------|
| FR-SCRAPE-01 | Two independent Lambda functions must exist: one for Devpost, one for Unstop. |
| FR-SCRAPE-02 | Each scraper is triggered by an EventBridge scheduled rule running twice per day (e.g., 08:00 UTC and 20:00 UTC). |
| FR-SCRAPE-03 | Each scraper fetches listings sorted by posted/published date descending and takes **at most 2 items per run** — items are sorted newest-first and the oldest excess items are left for the next scheduled run. |
| FR-SCRAPE-04 | Each listing captured must include at minimum: title, source platform, URL, posted date, deadline (if visible on listing page), eligibility snippet (if visible), and raw description text. |
| FR-SCRAPE-05 | Scrapers must be tolerant of upstream HTML changes — they must log a structured error and exit gracefully rather than crashing with an unhandled exception. |
| FR-SCRAPE-06 | After fetching, each scraper invokes the deduplication check before writing anything to DynamoDB. |

### 2.2 Deduplication (FR-DEDUP)

| ID | Requirement |
|----|-------------|
| FR-DEDUP-01 | Deduplication key is computed as `SHA-256(normalize(title) + "|" + source)` where `normalize` lowercases, strips leading/trailing whitespace, and collapses internal whitespace runs to a single space. |
| FR-DEDUP-02 | Before inserting a new item, the scraper checks whether the hash key already exists in the `opportunities` DynamoDB table using a `ConditionExpression`. |
| FR-DEDUP-03 | If the hash already exists, the item is silently skipped — no write, no agent invocation for that item. |
| FR-DEDUP-04 | If the hash does not exist, the raw item is written to DynamoDB with a status of `raw`. |
| FR-DEDUP-05 | After the scraper run completes, if at least one new item was written, the scraper publishes a single EventBridge event containing the list of new item IDs to trigger the agent pipeline. |
| FR-DEDUP-06 | If zero new items were found in a run, no EventBridge event is published and no agent is invoked. |

### 2.3 AI Agent Enrichment (FR-AGENT)

| ID | Requirement |
|----|-------------|
| FR-AGENT-01 | One Strands agent is deployed to Bedrock AgentCore Runtime. |
| FR-AGENT-02 | The agent is triggered **only** by the EventBridge event emitted by the scraper pipeline — never triggered by frontend reads. |
| FR-AGENT-03 | The agent receives the list of new item IDs, fetches each raw record from DynamoDB, and processes only those records. |
| FR-AGENT-04 | Per item, the agent must produce: category (one of: Cloud, AI, Software Engineering, Open Source), deadline (ISO 8601 date string or `"unknown"`), eligibility (structured string, e.g., "Open to university students globally"), relevance_reason (one sentence). |
| FR-AGENT-05 | The relevance_reason must be generated in the context of the student profile: AWS/cloud-focused builder, serverless project experience, Python and React skills. |
| FR-AGENT-06 | The agent uses Amazon Nova Micro as the primary model. If Nova Micro is unavailable in the target region, Nova Lite is the fallback. No other model may be used without explicit approval. |
| FR-AGENT-07 | After enrichment, the agent updates each DynamoDB item with the structured fields and sets status to `enriched`. |
| FR-AGENT-08 | The agent processes at most 4 records per invocation (2 platforms × 2 items hard cap). If the incoming event somehow contains more IDs, the agent logs a warning and processes only the first 4. |
| FR-AGENT-09 | The agent must complete within the Bedrock AgentCore timeout. Enrichment of 4 items must finish well under 5 minutes. |

### 2.4 API and Frontend Serving (FR-API)

| ID | Requirement |
|----|-------------|
| FR-API-01 | A single API Gateway (HTTP API, not REST API) endpoint is exposed: `GET /opportunities`. |
| FR-API-02 | A Lambda function handles the request, queries DynamoDB for items with status `enriched`, and returns the results as JSON. |
| FR-API-03 | The API Lambda makes **no model calls** — it only reads from DynamoDB. |
| FR-API-04 | The response includes: id, title, source, url, posted_date, deadline, eligibility, category, relevance_reason. |
| FR-API-05 | Optional query parameter `category` filters results by category value (exact match). |
| FR-API-06 | Results are sorted by posted_date descending, capped at 50 items (no pagination needed for MVP). |
| FR-API-07 | CORS headers must be present on all responses to allow frontend access from any origin (student-hosted frontend). |

---

## 3. Non-Functional Requirements

### 3.1 Cost Constraints (NFR-COST)

| ID | Requirement |
|----|-------------|
| NFR-COST-01 | All DynamoDB tables use on-demand (pay-per-request) billing mode. |
| NFR-COST-02 | Lambda functions use the minimum memory that passes functional tests (target: 128 MB for scrapers and API, 256 MB for agent trigger). |
| NFR-COST-03 | Lambda timeout is set to the minimum viable value: 30 s for scrapers, 30 s for API, 5 min for agent trigger. |
| NFR-COST-04 | No NAT Gateway, no VPC — all Lambda functions run in the public subnet or default VPC-less configuration to avoid NAT costs (~$32/mo). |
| NFR-COST-05 | No ElastiCache, no RDS, no SQS — DynamoDB is the only data store. |
| NFR-COST-06 | API Gateway is HTTP API (not REST API) — approximately 70% cheaper per million calls. |
| NFR-COST-07 | EventBridge rules use the default event bus — no custom event bus (custom buses have no additional cost but this keeps setup simple). |
| NFR-COST-08 | CloudWatch log retention for all log groups is set to 7 days to avoid unbounded log storage costs. |
| NFR-COST-09 | An AWS Budget alarm must be configured at $5/month threshold with email notification. |

### 3.2 Reliability

| ID | Requirement |
|----|-------------|
| NFR-REL-01 | Scraper failures (network errors, parse errors) must not leave partial writes in DynamoDB. If a scraper fails mid-run, items already written in that run remain but the agent trigger event is only published for successfully written items. |
| NFR-REL-02 | The agent must handle missing or malformed DynamoDB records gracefully — log the error and skip the item rather than failing the entire invocation. |

### 3.3 Security

| ID | Requirement |
|----|-------------|
| NFR-SEC-01 | Each Lambda function has its own IAM role with least-privilege permissions — no shared "god" role. |
| NFR-SEC-02 | DynamoDB table names and any configuration values are passed via Lambda environment variables — no hardcoded values in code. |
| NFR-SEC-03 | API Gateway endpoint requires no authentication for MVP (public read-only dashboard). This is an accepted risk for a student project. |

---

## 4. Out of Scope (MVP)

- User authentication or per-user personalization
- More than 2 source platforms
- Storing more than 2 items per platform per run (excess items are deferred to the next run)
- Write operations through the API
- Email or push notifications
- Frontend implementation (this document covers backend only)
- CI/CD pipeline
- Multi-region deployment
- Custom domain name

---

## 5. Cost Flags

The following design choices carry potential cost risk and are called out explicitly:

| Flag | Component | Risk | Mitigation |
|------|-----------|------|------------|
| ⚠️ COST-FLAG-01 | Bedrock Nova Micro | Per-token charges accumulate if agent is invoked unexpectedly frequently | Deduplication gate ensures agent only runs on genuinely new items; hard 4-item cap per invocation |
| ⚠️ COST-FLAG-02 | EventBridge | 1 million custom events/month free; $1/million after | At 4 events/day max this is effectively free |
| ⚠️ COST-FLAG-03 | DynamoDB on-demand | Read/write capacity units billed per operation | Low volume (≤4 writes/run, 2 runs/day) keeps this in free tier |
| ⚠️ COST-FLAG-04 | Lambda | 1M free invocations/month; 400K GB-seconds compute | 4 functions × 4 invocations/day = ~240/month, well within free tier |
| ⚠️ COST-FLAG-05 | CloudWatch Logs | Ingestion charged after free tier | 7-day retention cap limits storage cost |
| ⚠️ COST-FLAG-06 | Scraper HTTP calls | No cost on Lambda side, but if a scraper enters a retry loop it inflates Lambda duration | Exponential backoff with max 2 retries; hard timeout prevents runaway duration |

---

## 6. AWS Budget Alarm Setup

To be followed manually after deployment:

1. Open the AWS Billing Console → **Budgets** → **Create budget**
2. Select **Cost budget** → Next
3. Set **Period**: Monthly
4. Set **Budgeted amount**: `$5.00`
5. Under **Filters**: leave blank (covers all services)
6. **Alert threshold**: 80% of budgeted amount ($4.00) — triggers before you hit the limit
7. Add a second alert at 100% ($5.00)
8. **Notification**: Email — enter your email address
9. Create budget

This gives you a warning at $4 and a hard alert at $5.
