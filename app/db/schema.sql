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

-- Supabase auto-enables RLS on every table created in `public`, which
-- defaults to deny-all once enabled. Kavacha's own backend (kavacha_app)
-- authorizes in application code (FastAPI verifies the JWT, then filters
-- explicitly by owner_id) rather than through PostgREST's auth.uid() model,
-- so it needs an explicit policy to use the grants already scoped to it.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['projects', 'project_memory', 'issues', 'monitor_tests', 'audit_log']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS kavacha_app_full_access ON %I', t);
        EXECUTE format(
            'CREATE POLICY kavacha_app_full_access ON %I FOR ALL TO kavacha_app USING (true) WITH CHECK (true)',
            t
        );
    END LOOP;
END $$;
