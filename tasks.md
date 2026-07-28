# BuilderRadar AI — Implementation Task List

Work through these tasks in order. Each task is self-contained and 
verifiable before moving to the next. Do not start a task until the 
previous one is complete.

---

## Phase 1 — Project Scaffold

### Task 1.1 — Create directory structure
Create all folders and empty placeholder files matching the structure 
defined in design.md section 9:
```
functions/devpost_scraper/
functions/unstop_scraper/
functions/agent_trigger/
functions/api_handler/
agent/
```
No code yet — just the skeleton.

### Task 1.2 — Create SAM template skeleton (template.yaml)
Write `template.yaml` at the repo root with:
- SAM transform header
- Parameters section: `Env` (default: `dev`)
- Empty `Resources:` section (resources added in later tasks)
- Empty `Outputs:` section
This file will be filled in incrementally as each component is added.

---

## Phase 2 — DynamoDB Table

### Task 2.1 — Define DynamoDB table in template.yaml
Add the `OpportunitiesTable` resource to `template.yaml`:
- Type: `AWS::DynamoDB::Table`
- BillingMode: `PAY_PER_REQUEST` (on-demand)
- PartitionKey: `id` (String)
- No sort key
- No GSIs
- DeletionPolicy: `Retain` (prevents accidental data loss on stack updates)

### Task 2.2 — Add CloudWatch log groups with 7-day retention
Add four `AWS::Logs::LogGroup` resources to `template.yaml` — one per 
Lambda function — each with `RetentionInDays: 7`.
Name pattern: `/aws/lambda/builderradar-<function>-dev`

---

## Phase 3 — Shared Utilities

### Task 3.1 — Write deduplication utility (shared/dedup.py)
Create `functions/shared/dedup.py` containing one function:

```python
def compute_id(title: str, source: str) -> str
```

Logic:
1. Lowercase `title`, strip leading/trailing whitespace, collapse 
   internal whitespace runs to a single space.
2. Concatenate: `normalized_title + "|" + source`
3. Return `SHA-256` hex digest of the UTF-8 encoded string.

No external dependencies — stdlib only (`hashlib`, `re`).
Include a docstring and a short `if __name__ == "__main__"` smoke test.

### Task 3.2 — Write DynamoDB helpers (shared/db.py)
Create `functions/shared/db.py` with two functions:

```python
def put_raw_item(table, item: dict) -> bool
    """Attempt conditional put. Returns True if written, False if duplicate."""

def update_enriched(table, id: str, enrichment: dict) -> None
    """Write enriched fields and set status=enriched."""
```

`put_raw_item` uses `ConditionExpression=Attr('id').not_exists()` and 
catches `ConditionalCheckFailedException` to return `False` (duplicate) 
without raising.

---

## Phase 4 — Devpost Scraper

### Task 4.1 — Write devpost_scraper/handler.py
Implement the Lambda handler with this exact logic:

1. GET `https://devpost.com/hackathons?order_by=recently-added` with a 
   browser-like User-Agent header.
2. Parse HTML with BeautifulSoup, extract listing cards.
3. Sort by posted date descending (use the date attribute in the card).
4. **Hard cap: take first 2 items only** — do not process any more even 
   if more are present.
5. For each of the 2 items, build a dict with:
   `title`, `source="devpost"`, `url`, `posted_date`, `raw_description`
   (deadline and eligibility left blank — agent fills those).
6. Compute `id` using `shared.dedup.compute_id`.
7. Call `shared.db.put_raw_item` — collect IDs of successfully written items.
8. If any new items were written, call `events.put_events` with:
   ```json
   {
     "Source": "builderradar.ingestion",
     "DetailType": "NewOpportunities", 
     "Detail": "{\"ids\": [\"<id1>\", \"<id2>\"]}"
   }
   ```
9. Log counts: attempted, written, skipped (duplicates).
10. Graceful error handling: wrap scraping in try/except, log structured 
    error dict on failure, always return a Lambda response.

### Task 4.2 — Write devpost_scraper/requirements.txt
```
requests==2.31.0
beautifulsoup4==4.12.3
boto3==1.34.0
```

### Task 4.3 — Add devpost_scraper Lambda + IAM role to template.yaml
Add to `template.yaml`:
- `DevpostScraperFunction`: Python 3.12, 128 MB, 30 s timeout,
  env vars: `TABLE_NAME` (ref to table), `EVENT_BUS_NAME: "default"`
- `DevpostScraperRole`: IAM role with inline policy:
  - `dynamodb:PutItem` on `OpportunitiesTable` ARN
  - `events:PutEvents` on `arn:aws:events:*:*:event-bus/default`
  - `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
- `DevpostScraperSchedule`: `AWS::Events::Rule` with 
  `ScheduleExpression: "cron(0 8,20 * * ? *)"` targeting the Lambda.
- Lambda permission allowing EventBridge to invoke it.

---

## Phase 5 — Unstop Scraper

### Task 5.1 — Write unstop_scraper/handler.py
Same structure as Devpost scraper but targeting Unstop:

1. GET `https://unstop.com/hackathons` (or the appropriate listings URL) 
   with browser-like headers.
2. Parse HTML/JSON response (Unstop may return JSON from an API endpoint 
   — check response content-type and handle both cases).
3. Sort by posted date descending, **hard cap at 2 items**.
4. Build item dicts with `source="unstop"`.
5. Dedup, write, emit EventBridge event — identical logic to Devpost scraper.
6. Same graceful error handling pattern.

### Task 5.2 — Write unstop_scraper/requirements.txt
```
requests==2.31.0
beautifulsoup4==4.12.3
boto3==1.34.0
```

### Task 5.3 — Add unstop_scraper Lambda + IAM role to template.yaml
Mirror of Devpost scraper SAM resources — same schedule expression 
`cron(0 8,20 * * ? *)` so both run at the same times.

---

## Phase 6 — Agent Trigger Lambda

### Task 6.1 — Write agent_trigger/handler.py
This Lambda receives the EventBridge `NewOpportunities` event and runs 
the Strands agent inline (no AgentCore):

1. Extract `ids` list from `event["detail"]["ids"]`.
2. **Hard cap: slice to first 4 IDs** — log a warning if more are present.
3. Instantiate a `BedrockModel` pointing at `amazon.nova-micro-v1:0`.
4. Instantiate a `strands.Agent` with:
   - The BedrockModel
   - Two tools: `get_opportunity` and `save_enrichment` (imported from 
     `agent/tools.py` — see Task 6.2)
   - The system prompt from design.md section 7.4
5. Invoke the agent with: 
   `f"Process these opportunity IDs: {ids}"`
6. Log the agent response.
7. Return success response.

Error handling: if agent invocation fails, log the error and return a 
non-2xx response so EventBridge can retry (default: 3 retries).

### Task 6.2 — Write agent/tools.py
Implement the two `@tool`-decorated functions:

```python
@tool
def get_opportunity(id: str) -> dict:
    """Fetch a raw opportunity record from DynamoDB by its ID.
    
    Args:
        id: The SHA-256 hash ID of the opportunity to retrieve.
    
    Returns:
        dict containing title, source, url, raw_description, posted_date.
        Returns empty dict if not found.
    """

@tool  
def save_enrichment(
    id: str,
    category: str,
    deadline: str,
    eligibility: str,
    relevance_reason: str
) -> str:
    """Save AI-enriched fields back to DynamoDB and mark item as enriched.
    
    Args:
        id: The SHA-256 hash ID of the opportunity.
        category: One of: Cloud, AI, Software Engineering, Open Source.
        deadline: ISO 8601 date string (YYYY-MM-DD) or "unknown".
        eligibility: Plain English eligibility description or "unknown".
        relevance_reason: One sentence explaining relevance to student profile.
    
    Returns:
        "success" if saved, "error: <message>" if failed.
    """
```

Both functions read `TABLE_NAME` from environment variables and use 
`boto3` to access DynamoDB.

### Task 6.3 — Write agent_trigger/requirements.txt
```
strands-agents==0.1.x   (pin to latest stable at time of implementation)
boto3==1.34.0
```

### Task 6.4 — Add agent_trigger Lambda + IAM role to template.yaml
- `AgentTriggerFunction`: Python 3.12, 256 MB, 300 s timeout,
  env vars: `TABLE_NAME`
- `AgentTriggerRole`: IAM role with:
  - `dynamodb:GetItem` on `OpportunitiesTable` ARN
  - `dynamodb:UpdateItem` on `OpportunitiesTable` ARN
  - `bedrock:InvokeModel` on Nova Micro ARN: 
    `arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0`
  - `logs:*`
- `AgentTriggerEventRule`: `AWS::Events::Rule` matching:
  ```json
  { "source": ["builderradar.ingestion"],
    "detail-type": ["NewOpportunities"] }
  ```
  Targeting `AgentTriggerFunction`.
- Lambda permission allowing EventBridge to invoke it.

---

## Phase 7 — API Handler Lambda

### Task 7.1 — Write api_handler/handler.py
Implement the Lambda handler for `GET /opportunities`:

1. Parse optional `category` query parameter from 
   `event["queryStringParameters"]`.
2. Build DynamoDB `scan` with:
   - `FilterExpression: Attr('status').eq('enriched')`
   - If `category` provided: add `& Attr('category').eq(category)`
3. Collect all pages (handle DynamoDB pagination via `LastEvaluatedKey`).
4. Sort results by `posted_date` descending.
5. Slice to first 50 results.
6. Project to response fields: `id`, `title`, `source`, `url`, 
   `posted_date`, `deadline`, `eligibility`, `category`, `relevance_reason`.
7. Return:
   ```python
   {
     "statusCode": 200,
     "headers": {
       "Content-Type": "application/json",
       "Access-Control-Allow-Origin": "*",
       "Access-Control-Allow-Methods": "GET,OPTIONS",
       "Access-Control-Allow-Headers": "Content-Type"
     },
     "body": json.dumps({"opportunities": results, "count": len(results)})
   }
   ```
8. Handle OPTIONS preflight: return 200 with same CORS headers.

### Task 7.2 — Write api_handler/requirements.txt
```
boto3==1.34.0
```

### Task 7.3 — Add api_handler Lambda + API Gateway to template.yaml
- `ApiHandlerFunction`: Python 3.12, 128 MB, 10 s timeout,
  env var: `TABLE_NAME`
- `ApiHandlerRole`: IAM role with:
  - `dynamodb:Scan` on `OpportunitiesTable` ARN
  - `logs:*`
- `BuilderRadarHttpApi`: `AWS::ApiGatewayV2::Api` (HTTP API),
  with `CorsConfiguration` allowing all origins, GET and OPTIONS methods.
- `ApiHandlerIntegration` + `ApiRoute`: wire `GET /opportunities` to the Lambda.
- Lambda permission for API Gateway to invoke the function.
- Output: `ApiEndpoint` URL.

---

## Phase 8 — SAM Template Completion

### Task 8.1 — Add Outputs section to template.yaml
Add the following outputs:
- `ApiEndpoint`: The HTTP API invoke URL
- `OpportunitiesTableName`: DynamoDB table name
- `OpportunitiesTableArn`: DynamoDB table ARN

### Task 8.2 — Write samconfig.toml
Create `samconfig.toml` at the repo root with sensible defaults:
```toml
[default.deploy.parameters]
stack_name = "builderradar-ai"
region = "us-east-1"
capabilities = "CAPABILITY_IAM"
confirm_changeset = true
resolve_s3 = true
```
This makes `sam deploy` non-interactive after the first run.

---

## Phase 9 — Local Verification

### Task 9.1 — Smoke-test dedup utility
Run `python functions/shared/dedup.py` and verify the output hash is 
deterministic and correct for a known input.

### Task 9.2 — Validate SAM template
Run `sam validate --lint` and fix any errors before attempting a deploy.

### Task 9.3 — Verify Lambda package builds
Run `sam build` and confirm all 4 functions build without errors.
Check that `strands-agents` and `beautifulsoup4` are correctly included 
in their respective build artifacts.

---

## Phase 10 — Deployment

### Task 10.1 — Deploy stack
Run `sam deploy --guided` for first deploy.
Accept defaults from `samconfig.toml`.
Confirm the changeset shows the expected resources before approving.

### Task 10.2 — Post-deploy verification
After stack creation:
1. Note the `ApiEndpoint` output URL.
2. In the AWS Console, navigate to DynamoDB → Tables and confirm 
   `opportunities` table exists with on-demand billing.
3. Confirm all 4 Lambda functions are present with correct memory/timeout.
4. Confirm 2 EventBridge schedules exist for the scrapers.
5. Confirm 1 EventBridge rule exists for the agent trigger.

### Task 10.3 — Manual scraper test
In the AWS Console:
1. Open `devpost-scraper` Lambda → Test.
2. Use an empty JSON test event `{}`.
3. Verify execution logs show: items fetched, dedup check, items written 
   (or skipped if already seen), EventBridge event emitted.
4. Check DynamoDB to confirm items appear with `status="raw"`.
5. Repeat for `unstop-scraper`.

### Task 10.4 — Manual agent trigger test
After the scraper test writes raw items:
1. Open `agent-trigger` Lambda → Test.
2. Construct a test event matching the EventBridge shape:
   ```json
   {
     "source": "builderradar.ingestion",
     "detail-type": "NewOpportunities",
     "detail": { "ids": ["<id from step above>"] }
   }
   ```
3. Verify the agent enriches the item and updates DynamoDB status to `enriched`.

### Task 10.5 — API endpoint test
Call `GET <ApiEndpoint>/opportunities` from a browser or curl.
Confirm:
- Response is 200
- `opportunities` array contains enriched items
- CORS headers are present
- No model is invoked during this call

### Task 10.6 — Set up AWS Budget alarm
Follow the instructions in `requirements.md` section 6 to create a $5/month 
budget with alerts at 80% ($4) and 100% ($5).

---

## Task Order Summary

```
1.1 → 1.2
        ↓
2.1 → 2.2
        ↓
3.1 → 3.2
        ↓
4.1 → 4.2 → 4.3
        ↓
5.1 → 5.2 → 5.3
        ↓
6.1 → 6.2 → 6.3 → 6.4
        ↓
7.1 → 7.2 → 7.3
        ↓
8.1 → 8.2
        ↓
9.1 → 9.2 → 9.3
        ↓
10.1 → 10.2 → 10.3 → 10.4 → 10.5 → 10.6
```

Total: 30 tasks across 10 phases.
