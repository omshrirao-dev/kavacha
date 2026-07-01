CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    owner_id        UUID NOT NULL,
    tech_stack      JSONB,
    deployed_url    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          TEXT NOT NULL DEFAULT 'active',
    monthly_budget  NUMERIC
);

-- embedding_vector stores the ChromaDB document id, not the raw vector —
-- ChromaDB owns the vector itself per the architecture (Vector store vs.
-- Postgres structured metadata); this column is the pointer between them.
CREATE TABLE IF NOT EXISTS project_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stage           TEXT NOT NULL,
    layer           TEXT,
    content         TEXT NOT NULL,
    decision_type   TEXT,
    impact_level    TEXT,
    embedding_vector TEXT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    source          TEXT NOT NULL DEFAULT 'ai'
);
CREATE INDEX IF NOT EXISTS idx_project_memory_project_id ON project_memory(project_id);

CREATE TABLE IF NOT EXISTS issues (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    detected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    type                    TEXT NOT NULL,
    severity                TEXT NOT NULL,
    description             TEXT NOT NULL,
    root_cause              TEXT,
    memory_references       JSONB,
    fix_applied             BOOLEAN NOT NULL DEFAULT false,
    verified                BOOLEAN NOT NULL DEFAULT false,
    time_to_resolve_mins    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues(project_id);

CREATE TABLE IF NOT EXISTS monitor_tests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    test_query          TEXT NOT NULL,
    expected_behavior   TEXT NOT NULL,
    last_result         TEXT,
    pass_rate_7d        NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_monitor_tests_project_id ON monitor_tests(project_id);

-- Not in the original spec schema, but required to actually compute
-- pass_rate_7d and detect drift over time -- monitor_tests is "current
-- state per test," this is the run-by-run history that state is derived from.
CREATE TABLE IF NOT EXISTS monitor_test_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_test_id UUID NOT NULL REFERENCES monitor_tests(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ran_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    passed          BOOLEAN NOT NULL,
    severity        TEXT,
    response_text   TEXT,
    similarity_score NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_monitor_test_runs_test_id ON monitor_test_runs(monitor_test_id);
CREATE INDEX IF NOT EXISTS idx_monitor_test_runs_project_id ON monitor_test_runs(project_id);

-- Not in the original spec schema, but required to make Cost Intelligence
-- (Addition 2) real rather than fabricated -- captures actual token usage
-- from every LLM call so cost trajectory can be computed from real numbers.
CREATE TABLE IF NOT EXISTS llm_usage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL,
    model               TEXT NOT NULL,
    input_tokens        INTEGER NOT NULL,
    output_tokens       INTEGER NOT NULL,
    estimated_cost_usd  NUMERIC NOT NULL,
    purpose             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_project_id ON llm_usage(project_id);

-- Addition 1 (Cross-Project Pattern Learning): deliberately GLOBAL, no
-- project_id. The whole point is patterns learned fixing project A inform
-- project B -- per-project scoping would defeat the purpose.
CREATE TABLE IF NOT EXISTS fix_patterns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_type          TEXT NOT NULL,
    root_cause_pattern  TEXT NOT NULL,
    fix_template        TEXT NOT NULL,
    success_rate        NUMERIC NOT NULL DEFAULT 0,
    project_count       INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fix_patterns_issue_type ON fix_patterns(issue_type);

-- Addition 3 (Compliance Report Generator): stores each generated report so
-- the reports themselves are auditable and re-fetchable, not ephemeral.
CREATE TABLE IF NOT EXISTS compliance_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_by    UUID NOT NULL,
    report          JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_project_id ON compliance_snapshots(project_id);

-- Day 15-16 (Python SDK): API keys are long-lived bearer credentials
-- embedded in OTHER PEOPLE's server code -- a different threat model than
-- the dashboard's short-lived Supabase JWTs. Never store the raw key, only
-- a hash (same principle as password storage). key_prefix is just enough
-- to let a human recognize which key is which in a UI without exposing it.
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key_hash        TEXT NOT NULL UNIQUE,
    key_prefix      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ,
    revoked         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_api_keys_project_id ON api_keys(project_id);

-- Lightweight, metadata-only record of calls observed through kavacha.watch()
-- -- Security Addendum Rule 5: never the raw prompt/response, just enough to
-- prove the SDK is alive and show basic latency/error-rate on the dashboard.
CREATE TABLE IF NOT EXISTS sdk_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    success         BOOLEAN,
    latency_ms      INTEGER,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sdk_events_project_id ON sdk_events(project_id);

-- Day 21 (login screen hardening): lockout STATE only -- one row per email,
-- mutated atomically on every attempt. The forensic history of every attempt
-- (who, when, from where, success/failure) lives in audit_log below instead
-- of being duplicated here -- this table only ever needs to answer "is this
-- email locked right now," not "what happened."
CREATE TABLE IF NOT EXISTS login_attempts (
    email           TEXT PRIMARY KEY,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    last_attempt    TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until    TIMESTAMPTZ
);

-- Security Addendum Rule 3 (Immutable Audit Trail): every authenticated
-- access is recorded here by the auth middleware itself, so new routes
-- under /api/v1 are covered automatically without remembering to log.
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    TEXT NOT NULL,
    action      TEXT NOT NULL,
    resource    TEXT,
    outcome     TEXT NOT NULL,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- SendGrid notification wiring (Day 12-13): kavacha_app needs to resolve
-- owner_id -> email to actually send anything, but must never get direct
-- access to auth.users (password hashes, etc. -- Rule 4 least privilege).
-- Postgres views run with the OWNER's privileges against the underlying
-- table, not the querying role's -- so granting SELECT on just this view
-- (exposing only id+email) is sufficient without touching auth.users grants.
CREATE OR REPLACE VIEW public.user_emails AS
SELECT id, email FROM auth.users;

GRANT SELECT ON public.user_emails TO kavacha_app;

-- Security Wave 1 (invisibility layer): fake paths a real client never hits
-- (see app/api/v1/honeypot.py) -- a hit here is a near-certain scan/bot, not
-- a false positive from a misconfigured legitimate client. user_agent_hash,
-- not the raw string, matches the metadata-only philosophy already used for
-- sdk_events -- this table exists to notice a pattern, not to fingerprint.
-- Must be created before the RLS policy block below, which references it.
CREATE TABLE IF NOT EXISTS honeypot_hits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path            TEXT NOT NULL,
    method          TEXT NOT NULL,
    ip              TEXT,
    user_agent_hash TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_honeypot_hits_created_at ON honeypot_hits(created_at);
CREATE INDEX IF NOT EXISTS idx_honeypot_hits_ip ON honeypot_hits(ip);

-- Security Wave 2 (session/device tracking): one row per successful login,
-- not per request -- last_seen_at is set at insert time and isn't touched
-- again in this wave (there's no per-request "touch" call yet, so it's
-- effectively a synonym for created_at for now; kept as its own column so a
-- future wave can start updating it without a migration). user_agent_hash,
-- not the raw string, same metadata-only philosophy as honeypot_hits/
-- sdk_events. `revoked` here is bookkeeping/visibility only -- marking a row
-- revoked does NOT invalidate an already-issued Supabase JWT (see
-- app/core/sessions.py and app/api/v1/user.py's /sessions/revoke-all, which
-- calls Supabase's real admin.sign_out for actual enforcement).
CREATE TABLE IF NOT EXISTS user_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    device_fingerprint  TEXT NOT NULL,
    ip                  TEXT,
    user_agent_hash     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked             BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

-- Client Requirements (Wave 3): one row per project, upserted in place --
-- deliberately NOT append-only like project_memory. CEO Review needs a
-- reliable, deterministic "what does the client currently want" answer, and
-- this project already has a documented lesson (see the "Known limitation"
-- section below) that semantic search over ChromaDB can miss entries as a
-- collection grows -- reading structured fields straight from Postgres is
-- the correct fix, not a shortcut. Each save ALSO writes append-only
-- memory entries (stage="stage_5_client_requirements") for the historical
-- decision log -- this table is the current-state mirror CEO Review reads
-- directly, not a replacement for that log.
CREATE TABLE IF NOT EXISTS project_requirements (
    project_id           UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    core_purpose         TEXT NOT NULL,
    must_never_do        TEXT NOT NULL,
    response_style       TEXT NOT NULL,
    accuracy_threshold   INTEGER NOT NULL,
    speed_requirement_ms INTEGER,
    target_audience      TEXT,
    specific_rules       TEXT,
    success_definition   TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wave 4 (free trial): one row per user, created lazily on first touch
-- (there is no signup endpoint of our own -- signup goes straight to
-- Supabase -- so "auto-starts on signup" is implemented as "starts the
-- first time this account is seen," via app/core/accounts.py's
-- get_or_create_account()). trial_started_at never moves; trial_ends_at is
-- what actually gates access and is the only field a trial extension
-- touches. downgraded_at IS NULL means "still on trial, full access" --
-- once set, free-tier limits (see app/core/accounts.py) apply going forward.
-- No FK to auth.users, matching projects.owner_id's existing precedent
-- (kavacha_app has no grant on auth.users itself -- Rule 4).
CREATE TABLE IF NOT EXISTS accounts (
    user_id               UUID PRIMARY KEY,
    trial_started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    trial_ends_at           TIMESTAMPTZ NOT NULL,
    trial_extended          BOOLEAN NOT NULL DEFAULT false,
    warning_email_sent_at  TIMESTAMPTZ,
    downgraded_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wave 4: early-access signups for paid plans that don't exist yet --
-- collected from the waitlist modal every "Upgrade" click opens instead of
-- a payment page. No uniqueness constraint on email: waitlisting more than
-- once from different sources is harmless, and dedup can happen at export
-- time rather than complicating the write path now.
CREATE TABLE IF NOT EXISTS waitlist (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT NOT NULL,
    source       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at  TIMESTAMPTZ
);

-- Wave 4: day-10 trial survey responses. Submitting one is what triggers
-- the 15-day trial extension (app/core/accounts.py's extend_trial(), gated
-- on accounts.trial_extended so a second submission doesn't extend twice).
CREATE TABLE IF NOT EXISTS user_feedback (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL,
    rating        INTEGER NOT NULL,
    best_feature  TEXT,
    improvement   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase auto-enables RLS on every table created in `public`, which
-- defaults to deny-all once enabled. Kavacha's own backend (kavacha_app)
-- authorizes in application code (FastAPI verifies the JWT, then filters
-- explicitly by owner_id) rather than through PostgREST's auth.uid() model,
-- so it needs an explicit policy to use the grants already scoped to it.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'projects', 'project_memory', 'issues', 'monitor_tests', 'audit_log',
        'monitor_test_runs', 'llm_usage', 'fix_patterns', 'compliance_snapshots',
        'api_keys', 'sdk_events', 'login_attempts', 'honeypot_hits', 'user_sessions',
        'project_requirements', 'accounts', 'waitlist', 'user_feedback'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS kavacha_app_full_access ON %I', t);
        EXECUTE format(
            'CREATE POLICY kavacha_app_full_access ON %I FOR ALL TO kavacha_app USING (true) WITH CHECK (true)',
            t
        );
    END LOOP;
END $$;

-- Self-serve onboarding (Real-Product Upgrade): projects can now be created
-- directly via POST /api/v1/projects, without going through the Architect
-- Agent -- these columns capture what that form collects. ai_model/framework
-- are set once at creation (they personalize the SDK Setup snippet) and have
-- no edit path; the rest are editable from the Settings tab.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_model TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS framework TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notification_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS alerts_enabled BOOLEAN NOT NULL DEFAULT true;

-- Persisted (not just the in-memory APScheduler job state) so a redeploy
-- doesn't silently resume a project the owner explicitly paused, and so
-- app startup knows which projects to re-arm monitoring for -- see
-- the lifespan startup hook in app/main.py.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS monitoring_paused BOOLEAN NOT NULL DEFAULT false;

-- Real-Product Upgrade, Fix Engine approval gate: CRITICAL issues are now
-- diagnosed but not auto-applied (Rule 7) -- these columns hold the proposed
-- fix until a human clicks "Apply Fix" (POST .../issues/{id}/apply-fix).
-- INFO/WARNING issues are unaffected: they still auto-apply immediately and
-- never populate these columns. pending_fix_context carries whatever the
-- track-specific re-verification step needs after the fix is applied later
-- (e.g. Track A's test_query/expected_behavior).
ALTER TABLE issues ADD COLUMN IF NOT EXISTS dismissed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS proposed_fix_description TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS proposed_corrective_decision TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS estimated_cost_impact TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS pending_fix_context JSONB;
