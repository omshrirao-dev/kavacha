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
        'monitor_test_runs', 'llm_usage', 'fix_patterns', 'compliance_snapshots'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS kavacha_app_full_access ON %I', t);
        EXECUTE format(
            'CREATE POLICY kavacha_app_full_access ON %I FOR ALL TO kavacha_app USING (true) WITH CHECK (true)',
            t
        );
    END LOOP;
END $$;
