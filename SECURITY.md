# Security

Kavacha was built against a 9-rule security addendum from day one — not bolted on before launch. Every rule below is enforced in code today, in both the local dev environment and the live production deployment (Railway + Vercel + Supabase). Each one links to the actual implementation, not a description of an intention.

This document also covers the gaps that came up during a genuinely-run end-to-end test and production deployment, and how they were closed — because a security document that only lists what went right isn't credible.

---

## Rule 1 — Zero-knowledge secrets

Kavacha should never be the thing that leaks a secret it was trusted to hold.

- API keys (the credential the SDK uses) are generated with `secrets.token_urlsafe(32)`, shown to the developer **exactly once**, and stored only as a SHA-256 hash — the same principle as password storage. [`app/core/api_keys.py`](app/core/api_keys.py)
- The SDK never logs, prints, or includes the raw key in any exception message it raises. [`kavacha-sdk/kavacha/_client.py`](kavacha-sdk/kavacha/_client.py)
- `.env` is gitignored at every level of the repo (root, `frontend/`, and would be for any future subpackage); only `.env.example` files with placeholder values are committed. Verified by scanning full git history, not just the current working tree.
- During the Railway/Vercel deployment, every secret was piped into the platform's environment store via stdin (`railway variable set KEY --stdin`, `vercel env add`) — never as a command-line argument, never echoed to a terminal.
- The frontend's Supabase session is held in a custom in-memory storage adapter, never `localStorage`/`sessionStorage` — a page refresh logs you out by design. [`frontend/src/lib/supabase.ts`](frontend/src/lib/supabase.ts)

## Rule 2 — Data isolation

One customer's AI product should never be able to see another's.

- Every project-scoped query filters by `owner_id` against the requester's JWT, and a mismatch returns **404, not 403** — a non-owner can't even confirm the project exists. [`app/core/ownership.py`](app/core/ownership.py)
- Semantic memory search is filtered by `project_id` in ChromaDB's `where` clause on every query — one project's vectors are never returned for another's search. [`app/memory/engine.py`](app/memory/engine.py)
- The backend connects to Postgres as `kavacha_app`, a role with no row-level bypass — isolation is enforced in application code, not assumed from infrastructure.

## Rule 3 — Immutable audit trail

- Every authenticated access is written to `audit_log` (actor, action, resource, outcome, timestamp) by the auth middleware itself, so new routes are covered automatically without remembering to add logging. [`app/core/audit.py`](app/core/audit.py), [`app/db/schema.sql`](app/db/schema.sql)
- `project_memory` entries are append-only — there is no `UPDATE` or `DELETE` path on that table anywhere in the codebase. Decisions are recorded, never rewritten.
- Monitor job crashes are caught by APScheduler's error listener and written to `issues` as a `CRITICAL monitor_crash`, rather than disappearing into a log file no one reads. [`app/core/scheduler.py`](app/core/scheduler.py)

## Rule 4 — Least privilege

- The backend's runtime database role (`kavacha_app`) has `SELECT/INSERT/UPDATE/DELETE` on application tables only — no `DDL`, no schema changes, no access to `auth.users`. Email lookups for notifications go through a narrow `user_emails` VIEW (`id`, `email` only) instead of broadening grants onto the real `auth.users` table. [`app/db/schema.sql`](app/db/schema.sql)
- The SendGrid API key used in production is scoped to **Mail Send only** — it cannot read account settings, manage other keys, or do anything beyond sending the one kind of email Kavacha needs.
- An SDK route (`/api/v1/sdk/*`, API-key auth) and a dashboard route (`/api/v1`, JWT auth) are two different trust audiences sharing one middleware — a request must present the credential type the route family expects, or it's rejected before it reaches a handler. [`app/core/middleware.py`](app/core/middleware.py)

## Rule 5 — Raw data never reaches the LLM

- The SDK's `watch()` sends only call **metadata** to Kavacha — a timestamp, latency in milliseconds, success/failure. **Never the prompt, never the response.** This is a hard rule in the SDK, not a configurable option. [`kavacha-sdk/README.md`](kavacha-sdk/README.md)
- Anything that *is* stored as project memory (architectural decisions, discovery answers, CEO Review verdicts) is sanitized before it's embedded into the vector store or used to build any LLM prompt — see Rule 6.

## Rule 6 — Prompt injection / secret sanitization

- `sanitize_content()` strips mechanically-detectable secret shapes — API keys, JWTs, bearer tokens, AWS keys, database connection-string credentials, emails — using a fixed set of regex patterns before content ever reaches an embedding model or an LLM call. [`app/memory/sanitize.py`](app/memory/sanitize.py)
- This runs **unconditionally** inside `store_memory()`, so it covers every write path — including the SDK's `log_decision()`, which is developer-controlled (and therefore untrusted) input. [`app/memory/engine.py`](app/memory/engine.py)
- The CEO Review Agent, Fix Engine, and Monitor Agent each re-sanitize the memory context they assemble before sending it to an LLM — defense in depth, not a single choke point.

## Rule 7 — Agent autonomy limits

Kavacha's autonomy is scoped to **what Kavacha itself owns**: its own Postgres tables and its own notification channel. In this version, the Fix Engine:

- Queries project memory and `fix_patterns` for a root cause and a fix description
- Writes that description to `issues`
- Sends a notification

It does **not** open a pull request, run a shell command, deploy anything, or touch the developer's actual codebase or infrastructure. There is no `subprocess`, `exec`, or deployment call anywhere in [`app/services/fix_engine.py`](app/services/fix_engine.py) or [`app/services/monitor_agent.py`](app/services/monitor_agent.py) — confirmed by grep, not by description. The stronger version of "requires human approval for autonomous changes" is: *there is no autonomous write path into your system to approve in the first place.*

## Rule 8 — Web security baseline

- **Auth**: every protected route requires a valid JWT — ES256 verified against Supabase's public JWKS for real user sessions, HS256 shared-secret for service-issued tokens. A request with no/invalid token gets a generic 401, never a hint about which check failed. [`app/core/security.py`](app/core/security.py)
- **Rate limiting**: 60 requests/minute per client, enforced by `slowapi`, with `--proxy-headers --forwarded-allow-ips='*'` on the production uvicorn process so the limiter keys on the real client IP rather than Railway's shared proxy IP. [`app/core/limiter.py`](app/core/limiter.py)
- **CORS**: explicit origin allowlist, never `*` — which CORS forbids combining with credentialed requests anyway. Locked to the exact production frontend origin in deployment. [`app/core/config.py`](app/core/config.py)
- **SQL injection**: every query uses parameterized placeholders (`psycopg2`'s `%s`), never string-formatted SQL, anywhere in the codebase.
- **HTTPS**: enforced at the platform edge (Railway 301-redirects HTTP→HTTPS on the public domain, confirmed live) rather than in application middleware — see "Gap found and fixed" below for why that specific split matters.
- **Debug surface**: `/docs`, `/redoc`, and `/openapi.json` are only mounted when `APP_ENV=development` — confirmed 404 on the live production URL.
- **Security headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Content-Security-Policy: default-src 'none'` (this API serves JSON only — there's nothing for a CSP to permit) on every response, including 401/429 rejections. [`app/core/security_headers.py`](app/core/security_headers.py)
- **Login is the most targeted screen in any app, hardened accordingly**: the dashboard no longer signs in by calling Supabase directly from the browser — it goes through `POST /api/v1/auth/login` so Kavacha's own backend can enforce all of the following, verified live:
  - Server-side validation (email format + 254-char max, password 8–128 chars) before any database query or upstream call.
  - Account lockout: 5 failed attempts within 15 minutes locks the account for 30 minutes, tracked in `login_attempts` via a single atomic upsert (no read-then-write race between concurrent attempts). [`app/core/login_security.py`](app/core/login_security.py)
  - One generic message — `"Incorrect email or password"` — for every failure case (wrong password, nonexistent email, or anything else), confirmed identical for both a real and a fake email so the login screen can't be used to enumerate which accounts exist.
  - Every attempt (success, failure, or lockout) is written to `audit_log` with the source IP, not just a log line.
  - Monitor Agent Track A checks, on every scheduled run, whether the current project's owner is one of 10+ distinct emails a single IP has failed against in the last hour — a credential-stuffing pattern — and raises a CRITICAL issue with a real notification if so, deduplicated so it doesn't spam the same project repeatedly within the window. [`app/services/monitor_agent.py`](app/services/monitor_agent.py)

## Rule 9 — Security at every stage, not bolted on at the end

- The Architect Agent (Stage 2) produces an explicit `security` layer for every project, with its own reasoning recorded to memory — not a generic checklist.
- The CEO Review Agent (Stage 5) actively looks for security gaps as part of its review, not as a separate pass — a real run flagged "[high] security: the security approach does not explicitly address potential vulnerabilities in the AI model itself or the data processing pipeline" against this project's own demo data.
- The Compliance Report Generator produces GDPR, India DPDP Act, and SOC 2-style evidence **on demand, per project**, pulling from the real audit trail and decision history rather than a static template. [`app/services/compliance_report.py`](app/services/compliance_report.py)

---

## Gaps found and fixed (real ones, not hypothetical)

Security claims are only as good as the testing behind them. These were found by actually running the system, not by inspection:

1. **Budget-parsing regex matched the wrong number.** The cost-overrun detector's currency regex had an optional currency symbol, so `re.search()` matched the first bare number anywhere in a project's discovery text (`"fewer than 10 users"`) before ever reaching the real `$1` budget — silently treating a $1/month project as if it had a $10 budget. Fixed by making the currency match mandatory in the regex itself. Found and fixed during the Day 17-18 end-to-end test, verified live.
2. **The direct Supabase database host is IPv6-only on current infra; Railway has no IPv6 egress.** `db.<ref>.supabase.co` resolved to an IPv6 address that Railway's network couldn't route to (`Network is unreachable`). Fixed by switching to Supabase's Session Pooler host, which is IPv4-compatible and exists specifically for platforms like this.
3. **`HTTPSRedirectMiddleware` broke Railway's own healthcheck.** Railway's internal healthcheck hits the container directly over plain HTTP, bypassing the edge that would normally carry `X-Forwarded-Proto`. The app-level middleware saw `scheme=http` and 307-redirected the healthcheck, which doesn't follow redirects — the deploy never went healthy. Removed the app-level middleware after confirming live that Railway's edge already enforces HTTPS on the public domain; this moved enforcement to the correct layer, it didn't remove it.

## Known limitation (not yet fixed)

ChromaDB's approximate nearest-neighbor search, combined with metadata `where`-filtering, does not guarantee finding every matching document once the underlying collection grows large — confirmed live: after extensive repeated testing against the production deployment, semantic search for a project's recorded budget started intermittently (then consistently) missing the entry, while the same query against a smaller local collection succeeded every time. The query itself (`"what is the monthly budget?"`) is for a value that's actually structured data set once at Stage 2 — the durable fix is to read it directly from Postgres instead of through semantic search, not to tune the vector index. Tracked as a V2 item, not silently left undocumented.
