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
- **Security headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (denies geolocation/microphone/camera/payment/usb/interest-cohort), a `Content-Security-Policy: default-src 'none'` (this API serves JSON only — there's nothing for a CSP to permit), and `Strict-Transport-Security` (prod-only, same dev/prod split as the CSP) on every response, including 401/429/413/415/422/500 rejections. [`app/core/security_headers.py`](app/core/security_headers.py)
- **Server fingerprint**: uvicorn's `Server` response header (which would otherwise announce `uvicorn`) is disabled in production via `--no-server-header` on the launch command — a `Config`-level flag, not something ASGI middleware can strip after the fact. [`Dockerfile`](Dockerfile)
- **Generic error bodies at every layer**: an unhandled exception returns `{"detail": "Internal server error"}` (never a traceback — Starlette's `ServerErrorMiddleware` already defaulted to that, but it sits outside every other middleware, so the fix also had to add security headers back onto that response explicitly) and a request-validation failure returns `{"detail": "Invalid request"}` rather than FastAPI's default, which echoes Pydantic's internal `loc`/`msg`/`type`/`ctx` verbatim. The real detail is still logged server-side. [`app/main.py`](app/main.py)
- **Honeypots**: `/admin/login`, `/wp-admin`, `/phpMyAdmin`, `/api/v0/users`, `/config.php` are fake, unauthenticated top-level routes — a real client never has a reason to hit them. Every hit is logged (IP, path, method, a **hashed** user-agent — never the raw string) to `honeypot_hits`, and the first hit from a given IP in an hour triggers an admin alert (deduplicated so a scanner hammering all five paths doesn't generate hundreds of emails). [`app/api/v1/honeypot.py`](app/api/v1/honeypot.py)
- **Request size/shape limits**: URLs over 2048 characters, headers over 8KB, and JSON bodies over 1MB are rejected with a generic 413 before reaching auth or a route handler; `POST`/`PUT`/`PATCH` without `Content-Type: application/json` get a generic 415. [`app/core/request_limits.py`](app/core/request_limits.py)
- **Consistent input bounds**: every request body across the API now enforces explicit length/format bounds (matching the pattern this file already used for login's email/password) — including a UUID-shape check on every `project_id` field, and an explicit cap on `POST /api/v1/architect/run`'s `idea` field, which previously had none despite flowing directly into an LLM call.
- **HTML stripping**: project `name`/`description` are run through `bleach` before being stored, in addition to (not instead of) Rule 6's secret-shape stripping — a deliberately separate function, since folding HTML-stripping into `sanitize_content()` would silently broaden what that function's docstring promises. [`app/core/sanitize_html.py`](app/core/sanitize_html.py)
- **Login is the most targeted screen in any app, hardened accordingly**: the dashboard no longer signs in by calling Supabase directly from the browser — it goes through `POST /api/v1/auth/login` so Kavacha's own backend can enforce all of the following, verified live:
  - Server-side validation (email format + 254-char max, password 8–128 chars) before any database query or upstream call.
  - Account lockout: tiered (see Wave 2 entry below), tracked in `login_attempts` via a single atomic upsert (no read-then-write race between concurrent attempts). [`app/core/login_security.py`](app/core/login_security.py)
  - One generic message — `"Incorrect email or password"` — for every failure case (wrong password, nonexistent email, or anything else), confirmed identical for both a real and a fake email so the login screen can't be used to enumerate which accounts exist.
  - Every attempt (success, failure, or lockout) is written to `audit_log` with the source IP, not just a log line.
  - Monitor Agent Track A checks, on every scheduled run, whether the current project's owner is one of 10+ distinct emails a single IP has failed against in the last hour — a credential-stuffing pattern — and raises a CRITICAL issue with a real notification if so, deduplicated so it doesn't spam the same project repeatedly within the window. [`app/services/monitor_agent.py`](app/services/monitor_agent.py)
  - **Tiered lockout (Wave 2)**: escalates instead of a single threshold — 3 failed attempts locks for 30 seconds, 5 for 15 minutes, 10 for 24 hours, all within one atomic upsert (same no-read-then-write-race guarantee as before). The 429 response carries a `Retry-After` header computed from the real `locked_until`. [`app/core/login_security.py`](app/core/login_security.py)
  - **CAPTCHA hook (Wave 2)**: `app/core/captcha.py`'s `verify_captcha()` is a no-op (always passes) until `HCAPTCHA_SECRET_KEY` is set — no hCaptcha account exists yet. Once configured, a login attempt at or past the Tier-1 threshold (3 failed attempts) must include a solved `hcaptcha_token`, verified server-side against hCaptcha's `siteverify` endpoint, failing closed if hCaptcha itself is unreachable.
  - **New-device login alerts (Wave 2)**: every login is fingerprinted (a hash of IP + user-agent, never the raw user-agent) against `user_sessions`; a fingerprint never seen before for that user sends a "new login" email via the existing notifier. [`app/core/sessions.py`](app/core/sessions.py)
  - **Session cap and revocation (Wave 2)**: only the 5 most-recently-seen sessions per user stay marked active; older ones are marked revoked in `user_sessions`. Account Settings' "Log out of all devices" calls `POST /api/v1/user/sessions/revoke-all`, which passes the caller's own current JWT (never one Kavacha stored — Rule 1) to Supabase's `auth.admin.sign_out(scope="global")`, immediately revoking every refresh token for that user — real enforcement, not just a database flag. [`app/api/v1/user.py`](app/api/v1/user.py)
  - **Known limitation, disclosed rather than silently left**: marking a `user_sessions` row revoked (the automatic 5-session cap, and the per-row bookkeeping behind "revoke all") does not by itself invalidate an already-issued Supabase access token — Kavacha never stores raw tokens at rest, so there's nothing to invalidate directly. `POST /sessions/revoke-all` closes this gap by revoking the *refresh* token via Supabase's admin API using the request's own live JWT; the practical exposure window for any other route is bounded by that token's short expiry. Separately, `AccountSettingsPage.tsx`'s password-change form calls `supabase.auth.updateUser()` directly from the browser (bypassing Kavacha's backend entirely, unlike login), so a password change does not currently trigger a session revocation the way the original spec envisioned — doing so would mean routing password changes through Kavacha's own backend the way login already was (Rule 8), a larger change deferred rather than solved partially here.
- **Per-account rate limiting (Wave 2)**: a second dimension on top of the IP-based `slowapi` limit above — keyed by JWT `sub` or SDK `project_id`, 200 requests/minute, in-memory (consistent with the existing single-worker-process assumption; would need a shared store like Redis if this app ever runs multiple replicas). [`app/core/account_rate_limit.py`](app/core/account_rate_limit.py)

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
