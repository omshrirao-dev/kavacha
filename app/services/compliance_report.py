import json
from datetime import datetime, timezone

from app.db.database import get_connection
from app.memory.engine import search_memory

DISCLAIMER = (
    "This report aggregates factual evidence already recorded by Kavacha for this "
    "project (audit log entries, recorded security decisions, architecture properties). "
    "It does not constitute a legal compliance certification -- consult qualified legal "
    "counsel for an actual GDPR / DPDP / SOC 2 determination."
)

# Static facts about Kavacha's own architecture, true for every project --
# not generated, just stated, since they don't vary per project.
_DATA_ISOLATION_FACTS = [
    "Every project-scoped query is filtered by owner_id, verified against the requester's JWT before any data is returned (404, not 403, on mismatch -- doesn't even confirm the project exists to a non-owner).",
    "Semantic memory search (ChromaDB) is filtered by project_id on every query -- a project's vectors are never returned for a different project's search.",
    "The backend connects to PostgreSQL via a least-privilege role (kavacha_app) scoped to SELECT/INSERT/UPDATE/DELETE on application tables only -- no DDL rights, no access to other schemas.",
]

_SOC2_EVIDENCE = [
    "Security: all API access requires a valid JWT (ES256 against Supabase's public JWKS for real sessions, HS256 shared-secret fallback for service-issued tokens); every endpoint is rate-limited; ownership is verified before any project-scoped read or write.",
    "Availability: monitoring jobs run on a scheduler with crash detection -- a job exception is caught, logged to the issues table as a CRITICAL monitor_crash, and the scheduler continues running rather than dying silently.",
    "Processing integrity: all database writes use parameterized queries; LLM-generated output is validated against a strict JSON schema before being trusted or stored.",
    "Confidentiality: secrets are never hardcoded; client/project content is sanitized (API keys, JWTs, DB connection strings, emails redacted) before reaching any LLM call.",
]


def _get_security_decisions(project_id: str) -> list[dict]:
    entries = search_memory(project_id, query="security and access control decisions", n_results=50)
    return [e for e in entries if e.get("layer") == "security" or "security" in (e.get("decision_type") or "")]


def _get_audit_log_sample(project_id: str, limit: int = 50) -> tuple[list[dict], int]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM audit_log WHERE resource = %s", (project_id,))
            total = cur.fetchone()[0]
            cur.execute(
                """
                SELECT actor_id, action, outcome, created_at FROM audit_log
                WHERE resource = %s ORDER BY created_at DESC LIMIT %s
                """,
                (project_id, limit),
            )
            cols = [c.name for c in cur.description]
            rows = [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]
    return rows, total


def generate_compliance_report(project_id: str, owner_id: str) -> dict:
    security_decisions = _get_security_decisions(project_id)
    audit_sample, audit_total = _get_audit_log_sample(project_id)

    report = {
        "project_id": project_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gdpr_evidence": [
            f"{len(security_decisions)} security-related architectural decisions recorded with timestamp and reasoning (accountability principle).",
            "Per-project data isolation enforced at both the database and vector-store layers (security of processing).",
            f"Complete, immutable audit trail: {audit_total} recorded actions for this project (records of processing activity).",
        ],
        "dpdp_evidence": [
            "Every access to project data is authenticated, authorized, and logged -- supporting reasonable security safeguards expected under India's DPDP Act.",
            f"{len(security_decisions)} recorded decisions specifically addressing data handling and access control for this project.",
        ],
        "soc2_evidence": _SOC2_EVIDENCE,
        "security_decision_history": [
            {"timestamp": e["timestamp"], "stage": e["stage"], "content": e["content"]} for e in security_decisions
        ],
        "data_isolation_proof": _DATA_ISOLATION_FACTS,
        "access_control_log_sample": audit_sample,
        "access_control_log_total_entries": audit_total,
        "disclaimer": DISCLAIMER,
    }

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO compliance_snapshots (project_id, generated_by, report) VALUES (%s::uuid, %s::uuid, %s) RETURNING id",
                (project_id, owner_id, json.dumps(report, default=str)),
            )
            report["snapshot_id"] = str(cur.fetchone()[0])

    return report
