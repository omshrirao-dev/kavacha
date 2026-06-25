# Architecture

This is what's actually built and running, not the long-term vision. See [the global spec](kavacha-global-spec.md) for where this is headed; this document describes the V1 system live at the URLs in the README today.

## System diagram

```
                              ┌─────────────────────────┐
                              │   Developer's AI App     │
                              │  (any framework/stack)   │
                              └────────────┬─────────────┘
                                           │ pip install kavacha
                                           │ kavacha.watch(app)
                                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     KAVACHA BACKEND (Railway)                        │
│                                                                        │
│   FastAPI + single uvicorn worker, single replica                    │
│   ┌─────────────┐   ┌──────────────┐   ┌─────────────────────────┐   │
│   │  SDK routes  │   │  Dashboard   │   │   APScheduler            │   │
│   │ (API-key     │   │  routes      │   │   (BackgroundScheduler,  │   │
│   │  auth)       │   │ (Supabase    │   │   in-process)            │   │
│   │              │   │  JWT auth)   │   │   Track A / B / C        │   │
│   └──────┬───────┘   └──────┬───────┘   │   per project            │   │
│          │                  │           └────────────┬─────────────┘   │
│          ▼                  ▼                        ▼                │
│   ┌────────────────────────────────────────────────────────────────┐  │
│   │                  Project Memory Engine                          │  │
│   │   store_memory() / search_memory() -- sanitize_content() first  │  │
│   └───────────┬───────────────────────────────────┬──────────────────┘  │
│               ▼                                   ▼                    │
│   ┌───────────────────────┐           ┌───────────────────────────┐   │
│   │  PostgreSQL (Supabase) │           │  ChromaDB (persistent     │   │
│   │  structured metadata,  │           │  volume on Railway)       │   │
│   │  audit trail, issues   │           │  semantic memory search   │   │
│   └───────────────────────┘           └───────────────────────────┘   │
│               │                                                        │
│               ▼                                                        │
│   ┌───────────────────────┐           ┌───────────────────────────┐   │
│   │  LLM provider          │           │  SendGrid                 │   │
│   │  (Groq primary;        │           │  plain-language            │   │
│   │   Claude/Gemini also    │           │  notification               │   │
│   │   wired, pluggable)    │           └───────────────────────────┘   │
│   └───────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────┘
                                           ▲
                                           │ HTTPS, JWT in memory only
                                           │
                              ┌────────────┴─────────────┐
                              │   React Dashboard          │
                              │   (Vercel)                 │
                              └────────────────────────────┘
```

## The 7-stage lifecycle (spec) vs. what's built (V1)

| Stage | Spec intent | V1 status |
|---|---|---|
| 1 — Idea Intake | Plain-language input | Built — free-text `idea` field into Stage 2 |
| 2 — AI Architect | Interrogates the idea, produces a spec across 8 layers | **Built** — [`architect_agent.py`](app/services/architect_agent.py), stores 8 layers + discovery as 9 memory entries |
| 3 — AI Builder | Directs Claude Code layer by layer | Not built in V1 — out of scope for a 21-day proof of concept |
| 4 — AI Auditor | Reviews every layer, raises and fixes issues | Folded into Stage 5 below for V1 |
| 5 — AI CEO Client | Switches role to demanding client, compares promise vs. delivery | **Built** — [`ceo_review_agent.py`](app/services/ceo_review_agent.py), real LLM verdicts with severity-tagged gaps |
| 6 — Deploy | Manages deployment, generates docs | Done manually for V1 (this deployment), not yet agent-driven |
| 7 — AI Permanent Engineer | Monitors, diagnoses, fixes, verifies, notifies, forever | **Built** — Monitor Agent (3 tracks) + Fix Engine + notification, detailed below |

## The Project Memory Engine

The core differentiator, and the one piece every other stage depends on.

- **Dual-write**: every decision is written to both Postgres (`project_memory` — structured, queryable by stage/layer/timestamp) and ChromaDB (semantic search by meaning, not keyword).
- **`source` field** distinguishes AI-authored decisions (`"ai"`, from the Architect/CEO Review/Monitor agents) from human/SDK-logged ones (`"human"`, from `kavacha.log_decision()`) — so "why did we do this" can be answered honestly about who actually made the call.
- **Sanitized on write, not on read**: `sanitize_content()` runs inside `store_memory()` itself, so every consumer of memory — including future code that doesn't exist yet — gets sanitized content for free, rather than relying on every reader to remember to sanitize.

## Monitor Agent — 3 tracks

| Track | What it checks | Trigger |
|---|---|---|
| A — Hallucination | Scheduled test queries vs. known-good answers in memory | Every 15 min (configurable) |
| B — Cost | Real token cost from `llm_usage` vs. the Stage 2 approved budget, projected to a full month | Every 1 hour (configurable) |
| C — Drift | Re-runs CEO Review, diffs the verdict against the prior baseline | Every 24 hours (configurable) |

Each track runs as an APScheduler job, one set per monitored project, in the same process as the API server (see "Known limitations" below for what that trades away).

## Fix Engine — 5-step resolution

1. **Memory query** — what decisions were made in this layer, and has this exact pattern occurred before, in *any* project (`fix_patterns` is deliberately global, not per-project)
2. **Root cause statement** — a real LLM call grounded in the memory it just queried, citing specific prior decisions by stage/layer
3. **Fix specification** — a structured fix description (this version does not write code or touch the developer's repo — see [SECURITY.md, Rule 7](SECURITY.md#rule-7--agent-autonomy-limits))
4. **Issue recorded** — written to `issues` with root cause, fix description, and a link back to the memory it used
5. **Notification** — plain-language summary sent via SendGrid (or logged, if no provider configured)

## The 3 unique additions

These go beyond the original spec and beyond what general-purpose observability tools (Datadog, Sentry) or ML-specific ones (LangSmith, Weights & Biases) do, because none of them combine project memory with autonomous fixing in the first place:

1. **Cross-project pattern learning** (`fix_patterns`, no `project_id` — intentionally global). When the Fix Engine resolves an issue, it checks whether this `issue_type` has been seen before, in *any* project. A `cost_overrun` pattern first learned on one demo project now has a `project_count` of 4 and a recorded fix template, reused automatically the next time any project hits the same kind of issue.
2. **Cost intelligence** (`llm_usage` table — not in the original spec schema, added because cost tracking needs to be measured, not estimated). Every LLM call's real input/output token counts and computed cost are recorded; Track B projects that against the Stage 2 approved budget and flags when the trend crosses it by more than 20%.
3. **Compliance report generator** — produces GDPR, India DPDP Act, and SOC 2-style evidence sections on demand, built from the project's *actual* audit trail and decision history rather than a static boilerplate document, and persisted to `compliance_snapshots` so each report is independently re-fetchable later.

## Auth: two audiences, one middleware

The dashboard (human, browser session) and the SDK (machine, long-lived bearer credential embedded in someone else's server) have different threat models, so they use different credential types — but route through the same `SupabaseAuthMiddleware`:

- `/api/v1/sdk/*` requires a `kv_`-prefixed API key (SHA-256 hashed at rest)
- Everything else under `/api/v1` requires a Supabase JWT (ES256 via JWKS for real sessions, HS256 shared-secret for service-issued tokens)
- A request presenting the wrong credential type for a route family is rejected with the same generic 401 as a missing token — no information leak about which check failed

See [`app/core/middleware.py`](app/core/middleware.py).

## Deployment topology

- **Backend**: single Docker container on Railway, single replica, single uvicorn worker. Deliberate: APScheduler's `BackgroundScheduler` keeps monitor jobs in that one process's memory — more workers or replicas would each run their own copy of every job, duplicating issues and notifications.
- **Persistence**: a Railway Volume mounted at `/data` holds ChromaDB's on-disk index, so a redeploy doesn't wipe semantic memory.
- **Database**: Supabase Postgres, reached through the **Session Pooler** (not the direct `db.<ref>.supabase.co` host — see [SECURITY.md](SECURITY.md) for why that distinction mattered in practice).
- **Frontend**: static Vite build on Vercel, API base URL baked in at build time via `VITE_API_BASE_URL`.
- **CORS**: locked to the exact deployed frontend origin, set as a Railway environment variable, not hardcoded.

## API endpoints

All routes below are under the live backend's base URL. Dashboard routes require a Supabase JWT (`Authorization: Bearer <token>`); `/api/v1/sdk/*` routes require an API key instead (see [SECURITY.md](SECURITY.md)). Interactive Swagger docs are available locally at `/docs` when `APP_ENV=development` (disabled in production by design).

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/architect/run` | Run the Architect Agent (Stage 2) on a new idea |
| GET | `/api/v1/projects` | List projects owned by the caller |
| GET | `/api/v1/projects/{id}` | Single project, with computed health |
| GET | `/api/v1/projects/{id}/memory` | All memory entries for a project |
| GET | `/api/v1/projects/{id}/memory/search` | Semantic search over a project's memory |
| GET | `/api/v1/projects/{id}/issues` | Every issue Kavacha has detected for a project |
| POST | `/api/v1/projects/{id}/api-keys` | Issue a new SDK API key (raw key returned once) |
| GET | `/api/v1/projects/{id}/api-keys` | List a project's keys (prefix only, never the raw key) |
| POST | `/api/v1/ceo_review/run` | Run the CEO Review Agent (Stage 5) |
| POST | `/api/v1/monitor/start` | Start the Monitor Agent's 3 scheduled tracks for a project |
| POST | `/api/v1/monitor/stop` | Stop them |
| GET | `/api/v1/monitor/status` | Whether each track is scheduled and its next run time |
| GET | `/api/v1/monitor/cost` | Cost Intelligence: spend vs. approved budget, projected monthly |
| POST | `/api/v1/monitor/test` | Manually trigger one or all tracks immediately |
| GET | `/api/v1/fix-patterns` | Cross-project pattern library (global, not project-scoped) |
| POST | `/api/v1/compliance/report` | Generate a GDPR/DPDP/SOC2-style compliance snapshot |
| GET | `/api/v1/sdk/ping` | SDK connectivity check (API-key auth) |
| POST | `/api/v1/sdk/decisions` | `kavacha.log_decision()` lands here |
| POST | `/api/v1/sdk/watch-events` | `kavacha.watch()` call metadata lands here |

## Known limitations (V1, documented honestly)

- **Single-worker scheduling.** Real and load-bearing for correctness today (see above), but it means CPU-bound work (ChromaDB's local embedding model) on one request can queue up behind another's — multiple dashboard widgets fetching concurrently were observed taking 15-20+ seconds to all resolve together under load, rather than running in parallel. Acceptable for a single-tenant demo; would need a properly async-offloaded embedding step or a separate worker process before real concurrent users.
- **[V2] ChromaDB approximate search + metadata filtering doesn't guarantee recall as the collection grows.** Confirmed live: after extensive repeated testing against the production deployment, semantic search for a project's recorded budget (a `where`-filtered query against a now-larger shared collection) went from reliable to intermittent to consistently missing the entry — while the same query against a smaller local collection still succeeds every time. **Not fixed in this version, by design.** The correct fix is a behavior change, not a tuning knob: a project's monthly budget is structured data decided once at Stage 2, and `_get_approved_budget_usd()` in [`app/services/monitor_agent.py`](app/services/monitor_agent.py) should read it directly from Postgres (or a dedicated `projects.monthly_budget` column) instead of rediscovering it through semantic search on every call. Scoped explicitly as a V2 change so it can be reviewed and tested on its own, rather than folded silently into an unrelated commit.
- **No code-writing or deployment capability.** The Fix Engine generates a root cause and a fix *description*; it does not open a PR, run a command, or touch the developer's actual codebase. This is a deliberate scope boundary for V1 (see [SECURITY.md, Rule 7](SECURITY.md#rule-7--agent-autonomy-limits)), not an oversight — but it does mean "autonomous fix" today means "autonomous diagnosis with a specific, actionable fix handed to a human," not "autonomous code change."
- **Vector store is ChromaDB, local-disk-backed.** Fine for a single Railway volume at this scale; the spec's long-term plan is Pinecone at scale, not yet needed or built.
