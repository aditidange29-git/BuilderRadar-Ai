# BuilderRadar AI

> Automated hackathon and competition discovery for student builders — powered by AWS Bedrock AgentCore Runtime and the Strands Agents SDK.

**Problem:** Student developers waste hours manually scanning Devpost and Unstop for relevant hackathons. Most listings get missed, deadlines slip by, and there's no way to quickly judge whether an opportunity matches your skills without reading the full page.

**Solution:** A fully automated pipeline that scrapes, deduplicates, classifies, and explains new listings twice a day — with a one-sentence relevance explanation written for your specific profile — and surfaces them through a clean dashboard at near-zero cost.

---

## Live Demo

> **Dashboard:** [https://builder-radar-ai.netlify.app](https://builder-radar-ai.netlify.app)
>
> **API endpoint:** `https://7ah23zrgyi.execute-api.us-east-1.amazonaws.com/opportunities`

<!-- Add a screenshot here once the dashboard has live data
![BuilderRadar AI Dashboard](docs/screenshot.png)
-->

---

## Architecture

```
EventBridge (cron: 08:00 + 20:00 UTC)
      │
      ├──► Lambda: devpost-scraper ──┐
      │    (top 2 newest, hard cap)  │
      │                              ▼
      └──► Lambda: unstop-scraper   DynamoDB: opportunities
           (top 2 newest, hard cap)  │  (on-demand billing)
                │                    │
                │  SHA-256 dedup     │  status = "raw"
                │  (conditional put) │
                │                    │
                └── EventBridge ─────┘
                    NewOpportunities  │
                    event (only if    │
                    new items exist)  ▼
                              Lambda: agent-trigger
                                      │
                                      ▼
                          Bedrock AgentCore Runtime
                          Strands Agent (Nova Micro)
                          • classify: Cloud/AI/SWE/OSS
                          • extract: deadline, eligibility
                          • generate: relevance_reason
                                      │
                              DynamoDB: status = "enriched"
                                      │
                     ┌────────────────┘
                     ▼
              API Gateway (HTTP API)
              GET /opportunities
                     │
                     ▼
              Lambda: api-handler
              (DynamoDB scan, no model calls)
                     │
                     ▼
              React + Vite Dashboard
```

**Key design decisions:**
- Each scraper run caps at **2 items per platform** — bounds DynamoDB writes and agent workload
- The agent is only invoked when scrapers find genuinely new listings — `0 new items = 0 agent calls`
- The read path (API Gateway → Lambda → DynamoDB) never calls any model — always fast and free
- All state lives in a single DynamoDB table with on-demand billing

---

## Tech Stack

### AWS Services

| Service | Role | Why |
|---------|------|-----|
| **AWS Lambda** | Scrapers, agent trigger, API handler | Serverless, pay-per-use, free tier covers this workload |
| **Amazon DynamoDB** | Single source of truth for all opportunity data | On-demand billing, no provisioned capacity cost |
| **Amazon EventBridge** | Cron scheduling + pipeline trigger events | Sub-cent pricing at this event volume |
| **API Gateway (HTTP API)** | Public read-only endpoint for the dashboard | ~70% cheaper than REST API |
| **Bedrock AgentCore Runtime** | Hosts the Strands agent as a managed service | Challenge requirement; managed infra for agent execution |
| **Amazon Nova Micro** | LLM for classification + extraction + explanation | Cheapest Bedrock model; classification tasks don't need frontier quality |
| **Amazon S3** | Agent code deployment artifact | Used by SAM + AgentCore direct code deploy |
| **AWS IAM** | Least-privilege roles per function | Separate role per Lambda; no wildcard resource policies |
| **CloudWatch Logs** | Logging for all Lambda functions | 7-day retention to cap log storage cost |

### Frontend

| Tool | Role |
|------|------|
| **React 18** | Component framework |
| **Vite 5** | Build tool and dev server |
| **Plain CSS-in-JS** | Styling — no external CSS library, zero bundle bloat |

### Agent

| Tool | Role |
|------|------|
| **Strands Agents SDK** | Agent orchestration and tool-use framework |
| **bedrock-agentcore** | `BedrockAgentCoreApp` wrapper for AgentCore Runtime |
| **BeautifulSoup4** | HTML parsing for Devpost scraper |

---

## Project Structure

```
BuilderRadar-ai/
├── template.yaml                  # AWS SAM IaC — all Lambda + DynamoDB + API resources
├── samconfig.toml                 # SAM deployment defaults
│
├── functions/
│   ├── devpost_scraper/           # Scrapes Devpost, deduplicates, emits events
│   │   ├── handler.py
│   │   └── requirements.txt
│   ├── unstop_scraper/            # Scrapes Unstop (JSON API + HTML fallback)
│   │   ├── handler.py
│   │   └── requirements.txt
│   ├── agent_trigger/             # Receives EventBridge event, invokes AgentCore
│   │   ├── handler.py
│   │   └── requirements.txt
│   ├── api_handler/               # Read-only DynamoDB scan, serves JSON to frontend
│   │   ├── handler.py
│   │   └── requirements.txt
│   └── shared/
│       ├── dedup.py               # SHA-256 dedup key computation
│       └── db.py                  # DynamoDB helpers (put_raw_item, update_enriched)
│
├── agent/
│   ├── agent.py                   # Strands agent wrapped with BedrockAgentCoreApp
│   ├── tools.py                   # @tool functions: get_opportunity, save_enrichment
│   ├── requirements.txt
│   ├── deploy_agent.py            # boto3 deploy script (AgentCore direct code deploy)
│   └── .bedrock_agentcore.yaml    # AgentCore agent configuration
│
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── components/            # Header, Hero, FilterBar, OpportunityCard, etc.
    │   ├── hooks/useOpportunities.js
    │   └── config.js              # API base URL (set via VITE_API_URL)
    └── .env.local.example         # Copy to .env.local and fill in your API URL
```

---

## Setup & Deployment

### Prerequisites

```bash
# AWS CLI
winget install Amazon.AWSCLI       # Windows
# or: brew install awscli          # macOS

# AWS SAM CLI
winget install Amazon.SAM-CLI      # Windows
# or: brew tap aws/tap && brew install aws-sam-cli  # macOS

# Python 3.13+
# Node.js 18+

# Python dependencies for agent deployment
pip install bedrock-agentcore-starter-toolkit strands-agents boto3
```

### 1 — Configure AWS credentials

```bash
aws configure
# AWS Access Key ID:     <your key>
# AWS Secret Access Key: <your secret>
# Default region:        us-east-1
# Default output:        json
```

### 2 — Enable Bedrock model access

In the AWS Console: **Bedrock → Model access → Manage model access**
Enable: `Amazon Nova Micro` (and optionally Nova Lite as fallback)

### 3 — Deploy Lambda infrastructure (SAM)

```bash
# From repo root
sam build
sam deploy --guided
# Stack name: builderradar-ai
# Region:     us-east-1
# Accept all other defaults, save to samconfig.toml
```

Copy the `OpportunitiesTableName` and `ApiEndpoint` values from the deploy output.

### 4 — Deploy the Strands agent to AgentCore Runtime

```bash
# Fill in your table name in agent/.bedrock_agentcore.yaml
# Then from the agent/ directory:
cd agent
python deploy_agent.py
# Outputs the Agent ID — automatically wires it into the Lambda env var
```

### 5 — Run the frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local: set VITE_API_URL=https://<your-api-id>.execute-api.us-east-1.amazonaws.com

npm install
npm run dev       # local dev at http://localhost:3000
npm run build     # production build → dist/
```

Deploy `dist/` to [Netlify Drop](https://app.netlify.com/drop) or GitHub Pages for a free public URL.

### 6 — Set up the AWS Budget alarm

In the AWS Console: **Billing → Budgets → Create budget**

| Setting | Value |
|---------|-------|
| Type | Cost budget |
| Period | Monthly |
| Amount | $5.00 |
| Alert 1 | 80% of budget ($4.00) — early warning |
| Alert 2 | 100% of budget ($5.00) — hard limit |
| Notification | Your email address |

---

## Cost Design

This project is built for near-zero AWS spend. Every design decision was made with cost as the primary constraint.

| Component | Monthly cost | How it's bounded |
|-----------|-------------|-----------------|
| Lambda (4 functions) | ~$0.00 | Well within 1M free invocations/month |
| DynamoDB (on-demand) | ~$0.00 | ≤240 writes + reads/month; free tier covers it |
| API Gateway (HTTP API) | ~$0.00 | Free tier: 1M calls/month |
| EventBridge | ~$0.00 | Free tier: 1M events/month |
| Nova Micro (Bedrock) | ~$0.01 | 4 items × 2 runs/day × 30 days × ~$0.00004/call |
| AgentCore Runtime | ~$0.01–$0.05 | Per-second billing during agent execution only |
| CloudWatch Logs | ~$0.00 | 7-day retention cap |
| **Total** | **< $0.10** | |

**Cost guardrails built into the code:**
- Hard cap of 2 items per scraper per run — no unbounded DynamoDB writes
- EventBridge event suppressed when zero new items found — agent never wakes up unnecessarily
- Agent hard cap of 4 IDs per invocation — prevents runaway model calls
- API read path makes zero model calls — dashboard reads are always free
- All DynamoDB tables use `PAY_PER_REQUEST` — no idle provisioned capacity cost
- CloudWatch log groups have `RetentionInDays: 7` — no unbounded log accumulation

---

## Environment Variables

| Variable | Set on | Description |
|----------|--------|-------------|
| `TABLE_NAME` | All Lambda functions (via SAM) | DynamoDB table name |
| `EVENT_BUS_NAME` | Scraper Lambdas | EventBridge bus (`default`) |
| `AGENTCORE_AGENT_ID` | `agent-trigger` Lambda | AgentCore agent ID from deploy step |
| `AGENT_ITEM_CAP` | `agent-trigger` Lambda | Hard cap per invocation (default: `4`) |
| `BEDROCK_MODEL_ID` | AgentCore agent container | Model to use (default: `amazon.nova-micro-v1:0`) |
| `VITE_API_URL` | Frontend `.env.local` | API Gateway base URL |

---

## Credits

Built for the **AWS UG Madurai Kironomics Challenge**.

Uses the [Strands Agents SDK](https://strands.sela.ai) and [Amazon Bedrock AgentCore Runtime](https://aws.amazon.com/bedrock/agentcore/).
