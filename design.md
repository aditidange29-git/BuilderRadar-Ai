# BuilderRadar AI — System Design

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INGESTION PIPELINE                           │
│                                                                     │
│  EventBridge (cron)                                                 │
│  08:00 + 20:00 UTC ──┬──► Lambda: devpost-scraper                  │
│                      │         │ fetch top-2 newest listings        │
│                      │         │ dedup check (DynamoDB condition)   │
│                      │         │ write raw items                    │
│                      │         │                                    │
│                      └──► Lambda: unstop-scraper                   │
│                                │ fetch top-2 newest listings        │
│                                │ dedup check (DynamoDB condition)   │
│                                │ write raw items                    │
│                                │                                    │
│                      Both scrapers emit one combined                │
│                      EventBridge event if new items exist           │
│                                │                                    │
│                                ▼                                    │
│                      EventBridge Rule                               │
│                      (builderradar.ingestion source)                │
│                                │                                    │
│                                ▼                                    │
│                      Lambda: agent-trigger                          │
│                      (reads new item IDs from event)                │
│                                │                                    │
│                                ▼                                    │
│                      Bedrock AgentCore Runtime                      │
│                      Strands Agent (Nova Micro)                     │
│                      • classify category                            │
│                      • extract deadline + eligibility               │
│                      • generate relevance_reason                    │
│                      • write enriched fields back to DynamoDB       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         READ PATH                                   │
│                                                                     │
│  Frontend (browser)                                                 │
│       │                                                             │
│       ▼                                                             │
│  API Gateway (HTTP API)                                             │
│  GET /opportunities                                                 │
│       │                                                             │
│       ▼                                                             │
│  Lambda: api-handler                                                │
│  (DynamoDB query, status=enriched, no model calls)                  │
│       │                                                             │
│       ▼                                                             │
│  DynamoDB: opportunities table                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Inventory

| Component | Type | Purpose |
|-----------|------|---------|
| `devpost-scraper` | Lambda (128 MB, 30 s) | Scrape Devpost, dedup, write raw items |
| `unstop-scraper` | Lambda (128 MB, 30 s) | Scrape Unstop, dedup, write raw items |
| `agent-trigger` | Lambda (256 MB, 5 min) | Bridge between EventBridge event and Bedrock AgentCore |
| `api-handler` | Lambda (128 MB, 10 s) | Serve enriched opportunities to frontend |
| `opportunities` | DynamoDB table (on-demand) | Single source of truth for all opportunity data |
| EventBridge schedule | 2× daily cron | Trigger both scrapers |
| EventBridge custom event | Detail-type: `NewOpportunities` | Trigger agent-trigger Lambda |
| API Gateway HTTP API | `GET /opportunities` | Public read-only endpoint |
| Bedrock AgentCore Runtime | Managed runtime | Host Strands agent |

---

## 3. DynamoDB Data Model

### Table: `opportunities`

**Single table design.** One table covers all items in all states.

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` (PK) | String | `SHA-256(normalize(title) + "\|" + source)` — serves as both dedup key and primary key |
| `title` | String | Original title as scraped |
| `source` | String | `"devpost"` or `"unstop"` |
| `url` | String | Canonical URL for the listing |
| `posted_date` | String | ISO 8601 date (e.g. `"2025-07-28"`), used for sort |
| `status` | String | `"raw"` → `"enriched"` (state machine) |
| `raw_description` | String | Full scraped description text; only used by agent |
| `deadline` | String | ISO 8601 date or `"unknown"` — populated by agent |
| `eligibility` | String | Plain text summary — populated by agent |
| `category` | String | One of: `Cloud`, `AI`, `Software Engineering`, `Open Source` |
| `relevance_reason` | String | One-sentence agent-generated explanation |
| `enriched_at` | String | ISO 8601 timestamp of agent enrichment |
| `ingested_at` | String | ISO 8601 timestamp of scraper write |

**Access patterns:**

| Pattern | Method | Notes |
|---------|--------|-------|
| Dedup check on insert | `put_item` with `ConditionExpression: "attribute_not_exists(id)"` | Atomic — no separate read needed |
| Fetch raw item by ID | `get_item(id)` | Used by agent-trigger |
| List enriched items | `scan` with `FilterExpression: status = "enriched"` | Acceptable at MVP volume (≤ ~240 items/month max); no GSI needed |
| Filter by category | `scan` with `FilterExpression: status = "enriched" AND category = :cat` | Same reasoning |

> **Cost note:** A `scan` on a small table costs fractions of a cent at this volume. Adding a GSI for `status` would add write costs on every insert and enrichment update. For MVP, scan is cheaper.

**Global Secondary Indexes:** None — deferred until table exceeds ~1,000 items, at which point a GSI on `status` + `posted_date` would make sense.

---

## 4. Data Flow: Ingestion Pipeline

```
Step 1 — EventBridge fires cron rule (twice daily)
         └─► Invokes devpost-scraper AND unstop-scraper concurrently

Step 2 — Each scraper (example: devpost-scraper):
         a. GET Devpost listings page, parse HTML
         b. Sort by posted date descending, take first 2
         c. For each item:
            i.  Compute id = SHA-256(normalize(title) + "|devpost")
            ii. Attempt DynamoDB put_item with condition attribute_not_exists(id)
                - ConditionalCheckFailedException → skip (duplicate)
                - Success → item written with status="raw"
         d. Collect list of newly written IDs
         e. If list is non-empty → put EventBridge event:
            {
              "source": "builderradar.ingestion",
              "detail-type": "NewOpportunities",
              "detail": { "ids": ["abc123", "def456"] }
            }
         f. If list is empty → exit, no event published

Step 3 — Both scrapers emit their own events independently.
         EventBridge rule matches on source="builderradar.ingestion"
         and invokes agent-trigger once per event.

Step 4 — agent-trigger Lambda:
         a. Receives EventBridge event, extracts ids (max 4 enforced here)
         b. Calls Bedrock AgentCore to invoke the Strands agent,
            passing item IDs as input
         c. Waits for agent completion (synchronous invoke)

Step 5 — Strands agent (running in AgentCore):
         For each ID:
         a. get_item from DynamoDB → fetch raw record
         b. Prompt Nova Micro with title + raw_description
         c. Parse structured JSON response → category, deadline,
            eligibility, relevance_reason
         d. update_item in DynamoDB → write enriched fields,
            set status="enriched", set enriched_at=now()
```

---

## 5. Data Flow: Read Path

```
Frontend → GET /opportunities?category=Cloud
         └─► API Gateway HTTP API
             └─► api-handler Lambda
                 a. Parse query params
                 b. scan DynamoDB (status=enriched [+ category filter])
                 c. Sort by posted_date desc, limit 50
                 d. Return JSON array
                 e. CORS headers on all responses
```

No model is called. No agent is invoked. This path is pure DynamoDB read.

---

## 6. Lambda Function Specifications

### 6.1 `devpost-scraper`

```
Runtime:     Python 3.12
Memory:      128 MB
Timeout:     30 s
Trigger:     EventBridge schedule (cron)
Layers:      requests (Lambda layer or bundled in deployment zip)
Env vars:    TABLE_NAME, EVENT_BUS_NAME
IAM perms:   dynamodb:PutItem on opportunities table
             events:PutEvents on default event bus
             logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents
```

### 6.2 `unstop-scraper`

```
Runtime:     Python 3.12
Memory:      128 MB
Timeout:     30 s
Trigger:     EventBridge schedule (cron)
Layers:      requests (bundled)
Env vars:    TABLE_NAME, EVENT_BUS_NAME
IAM perms:   Same as devpost-scraper
```

### 6.3 `agent-trigger`

```
Runtime:     Python 3.12
Memory:      256 MB
Timeout:     300 s (5 min)
Trigger:     EventBridge rule on source="builderradar.ingestion"
Env vars:    TABLE_NAME, AGENTCORE_AGENT_ID, AGENTCORE_AGENT_ALIAS_ID
IAM perms:   dynamodb:GetItem on opportunities table
             bedrock:InvokeAgent (AgentCore)
             logs:*
```

### 6.4 `api-handler`

```
Runtime:     Python 3.12
Memory:      128 MB
Timeout:     10 s
Trigger:     API Gateway HTTP API
Env vars:    TABLE_NAME
IAM perms:   dynamodb:Scan on opportunities table
             logs:*
```

---

## 7. Strands Agent Design

### 7.1 Deployment

The agent is packaged as a Python application and deployed to **Bedrock AgentCore Runtime**. It is not a Lambda — it runs in the managed AgentCore container environment.

### 7.2 Model Selection

**Primary:** `amazon.nova-micro-v1:0`
**Fallback:** `amazon.nova-lite-v1:0`

Nova Micro pricing (us-east-1, as of mid-2025):
- Input: $0.000035 / 1K tokens
- Output: $0.00014 / 1K tokens

At 4 items/invocation, ~500 input tokens and ~150 output tokens per item:
- Per run cost ≈ 4 × (0.5K × $0.000035 + 0.15K × $0.00014) ≈ **$0.000154/run**
- At 2 runs/day × 30 days = **~$0.009/month** — negligible.

### 7.3 Agent Tools

The agent is given two DynamoDB tools implemented as `@tool`-decorated functions:

```
get_opportunity(id: str) -> dict
    Fetches a single raw record from DynamoDB by id.

save_enrichment(id: str, category: str, deadline: str,
                eligibility: str, relevance_reason: str) -> bool
    Writes enriched fields to DynamoDB and sets status="enriched".
```

### 7.4 System Prompt

```
You are BuilderRadar, an AI assistant that analyzes student opportunity 
listings (hackathons, competitions, open source programs).

Student profile:
- AWS/cloud-focused builder
- Serverless project experience (Lambda, DynamoDB, API Gateway)
- Python and React skills
- University student

For each opportunity ID provided:
1. Call get_opportunity(id) to retrieve the listing.
2. Classify it into exactly one category: Cloud, AI, Software Engineering, 
   or Open Source.
3. Extract the application deadline as an ISO 8601 date (YYYY-MM-DD). 
   If not found, use "unknown".
4. Extract eligibility requirements as a brief plain-English phrase 
   (e.g., "Open to university students globally"). If not found, use "unknown".
5. Write one sentence explaining why this opportunity is relevant to 
   the student profile above.
6. Call save_enrichment(id, category, deadline, eligibility, relevance_reason)
   to persist the results.

Process each ID fully before moving to the next. Do not skip any ID.
```

### 7.5 Input Format

The agent-trigger Lambda invokes the agent with a plain text prompt:

```
Process these opportunity IDs: ["abc123", "def456", "ghi789"]
```

---

## 8. IAM Role Summary

| Role | Attached to | Key Permissions |
|------|-------------|-----------------|
| `BuilderRadarScraperRole` | devpost-scraper, unstop-scraper | `dynamodb:PutItem`, `events:PutEvents`, `logs:*` |
| `BuilderRadarAgentTriggerRole` | agent-trigger | `dynamodb:GetItem`, `bedrock:InvokeAgent`, `logs:*` |
| `BuilderRadarApiRole` | api-handler | `dynamodb:Scan`, `logs:*` |
| `BuilderRadarAgentCoreRole` | AgentCore execution | `dynamodb:GetItem`, `dynamodb:UpdateItem`, `bedrock:InvokeModel` |

All roles are scoped to specific table ARNs and log group ARNs — no wildcards on resources.

---

## 9. Project File Structure

```
BuilderRadar-ai/
├── requirements.md
├── design.md
├── template.yaml                  # AWS SAM template (all infra as code)
│
├── functions/
│   ├── devpost_scraper/
│   │   ├── handler.py
│   │   └── requirements.txt       # requests, beautifulsoup4, boto3
│   │
│   ├── unstop_scraper/
│   │   ├── handler.py
│   │   └── requirements.txt
│   │
│   ├── agent_trigger/
│   │   ├── handler.py
│   │   └── requirements.txt       # boto3
│   │
│   └── api_handler/
│       ├── handler.py
│       └── requirements.txt       # boto3
│
└── agent/
    ├── agent.py                   # Strands agent definition
    ├── tools.py                   # get_opportunity, save_enrichment tools
    └── requirements.txt           # strands-agents, boto3
```

---

## 10. Infrastructure as Code Approach

All AWS resources are defined in a single **AWS SAM** (`template.yaml`) file. SAM is chosen over raw CloudFormation because:
- `sam build` handles Lambda dependency packaging automatically
- `sam deploy --guided` is the simplest single-command deploy path for a solo student
- No additional tooling (CDK, Terraform) to install or learn

Resources defined in template.yaml:
- DynamoDB table (`opportunities`)
- 4 Lambda functions with their IAM roles and env vars
- 2 EventBridge schedule rules (scraper cron)
- 1 EventBridge rule (agent trigger on custom event)
- API Gateway HTTP API
- CloudWatch log groups (7-day retention each)

---

## 11. Cost Estimate (Monthly)

| Service | Usage | Estimated Cost |
|---------|-------|----------------|
| Lambda | ~4 functions × ~60 invocations/month × avg 5s @ 128 MB | ~$0.00 (free tier) |
| DynamoDB | ~240 writes + ~240 reads/month (on-demand) | ~$0.00 (free tier) |
| API Gateway (HTTP) | Assume 1,000 requests/month | ~$0.00 (free tier covers 1M) |
| EventBridge | ~120 custom events/month | ~$0.00 (1M/month free) |
| Bedrock Nova Micro | ~60 invocations × 4 items × ~650 tokens | **~$0.01** |
| CloudWatch Logs | Minimal, 7-day retention | ~$0.00 |
| AgentCore Runtime | Per-second billing during agent execution | **~$0.01–$0.05** |
| **Total** | | **< $0.10/month** |

> ⚠️ **COST-FLAG:** AgentCore Runtime pricing is usage-based and region-dependent. Verify current rates in the [Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/) before deploying. The $5 budget alarm provides a hard safety net regardless.

---

## 12. Decisions Log

| Decision | Rationale |
|----------|-----------|
| SAM over CDK | Simpler toolchain for solo student; no TypeScript/Node.js dependency |
| Single DynamoDB table | Cheapest; no cross-table joins needed |
| Scan over GSI | At <500 items/month, scan is cheaper than maintaining a GSI (avoids extra write CUs) |
| HTTP API over REST API | ~70% cheaper; no usage plans, API keys, or authorizers needed for MVP |
| Nova Micro over Claude | Orders-of-magnitude cheaper per token; classification tasks don't require frontier model quality |
| No SQS between scrapers and agent | Removes one service; EventBridge custom events are sufficient for this trigger pattern |
| No VPC | Avoids $32+/month NAT Gateway cost; scraper targets are public internet |
| Scrapers emit events independently | Simpler than coordinating a barrier; agent-trigger handles ≤4 items per event naturally |
