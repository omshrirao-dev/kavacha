from fastapi import APIRouter, Request, Response

from app.core.limiter import limiter

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])

# Entirely static, hand-written content -- no database query anywhere in this
# module, on purpose. A real DB-backed "demo project" would mean either a
# write path to seed/reset it (something to accidentally break or abuse) or
# a real LLM call on every anonymous page load (a public, unauthenticated
# cost-abuse vector). Static content has neither problem and is exactly as
# inspectable/correct either way -- this is fake-but-realistic data, openly
# labeled as such everywhere it's shown.
DEMO_PROJECT_ID = "demo-shopgenie"

_DEMO_DATA = {
    "project": {
        "id": DEMO_PROJECT_ID,
        "name": "ShopGenie -- AI Shopping Assistant",
        "status": "active",
        "created_at": "2026-05-12T09:00:00Z",
        "health": "yellow",
    },
    "memory": [
        {
            "id": "demo-mem-1",
            "stage": "stage_2_architect",
            "layer": "ai_specific",
            "content": (
                "Decision: use RAG over the product catalog rather than fine-tuning a model on it.\n\n"
                "Reasoning: the catalog changes weekly (new stock, price changes, discontinued items) -- "
                "fine-tuning would mean retraining on every change. RAG lets new products become "
                "queryable the moment they're indexed, at a fraction of the cost."
            ),
            "decision_type": "architecture",
            "impact_level": "high",
            "timestamp": "2026-05-12T09:14:00Z",
            "source": "ai",
        },
        {
            "id": "demo-mem-2",
            "stage": "stage_2_architect",
            "layer": "data",
            "content": (
                "Decision: chunk_size=400 for product descriptions, with a 50-token overlap.\n\n"
                "Reasoning: product descriptions are short (avg. 180 tokens) -- a larger chunk size "
                "was rejected in Stage 2 to keep embedding costs down at the then-expected catalog size "
                "of ~2,000 SKUs."
            ),
            "decision_type": "architecture",
            "impact_level": "medium",
            "timestamp": "2026-05-12T09:21:00Z",
            "source": "ai",
        },
        {
            "id": "demo-mem-3",
            "stage": "stage_7_sdk",
            "layer": "ai_specific",
            "content": (
                "Decision: refund and return-policy questions are answered from a fixed, human-reviewed "
                "FAQ document, never from the general product-catalog RAG pipeline.\n\n"
                "Reasoning: a wrong answer about availability is a minor inconvenience; a wrong answer "
                "about refund eligibility is a real liability. Logged after a near-miss in testing where "
                "the catalog RAG pipeline nearly answered a refund question using a similar-sounding but "
                "unrelated product's return window."
            ),
            "decision_type": "discovery_answers",
            "impact_level": "high",
            "timestamp": "2026-06-02T16:40:00Z",
            "source": "human",
        },
    ],
    "issues": [
        {
            "id": "demo-issue-1",
            "detected_at": "2026-06-10T03:14:00Z",
            "type": "hallucination",
            "severity": "CRITICAL",
            "description": "Test query 'Is the Aurora Desk Lamp available in blue?' diverged from expected behavior: the assistant invented a blue variant that doesn't exist in the catalog.",
            "root_cause": "Retrieval returned the closest-matching chunk by embedding similarity (the Aurora Desk Lamp's main listing) rather than confirming the specific color variant exists, because color/variant data lives in a separate structured field not included in the embedded chunk text (chunk_size=400 decision, Stage 2 / data layer).",
            "fix_applied": True,
            "verified": True,
            "time_to_resolve_mins": 4,
        },
        {
            "id": "demo-issue-2",
            "detected_at": "2026-06-14T11:02:00Z",
            "type": "hallucination",
            "severity": "WARNING",
            "description": "Test query 'Do you ship to Canada?' diverged from expected behavior: gave a confident yes/no answer instead of directing to the shipping-policy page for international orders.",
            "root_cause": "No memory entry records international shipping as an explicit edge case -- the assistant answered from general catalog context, which doesn't cover logistics policy.",
            "fix_applied": True,
            "verified": True,
            "time_to_resolve_mins": 7,
        },
        {
            "id": "demo-issue-3",
            "detected_at": "2026-06-18T22:47:00Z",
            "type": "cost_overrun",
            "severity": "CRITICAL",
            "description": "Projected monthly cost $187.40 exceeds the Stage 2 approved budget of $120.00 by more than 20% (based on 6.2 days of usage, $38.71 spent so far).",
            "root_cause": "chunk_size=400 with 50-token overlap (set in Stage 2 for cost reasons at ~2,000 SKUs) now runs against a catalog that's grown to 7,800 SKUs -- more chunks per query than originally budgeted for.",
            "fix_applied": True,
            "verified": True,
            "time_to_resolve_mins": 2,
        },
    ],
    "ceo_review": {
        "project_id": DEMO_PROJECT_ID,
        "approved": False,
        "summary": "The current implementation has real gaps in security, data handling, and AI-specific risk -- not ready to ship as-is.",
        "issues": [
            {
                "requirement_reference": "security",
                "gap_description": "Customer order history is included in the same retrieval context as general product Q&A, with no documented access control separating the two -- a prompt-injection-style query could plausibly surface another customer's order data.",
                "severity": "high",
            },
            {
                "requirement_reference": "data",
                "gap_description": "Catalog variant data (color, size) isn't part of the embedded chunk text, which already caused one hallucinated product variant in production.",
                "severity": "high",
            },
            {
                "requirement_reference": "ai_specific",
                "gap_description": "No confidence threshold or fallback for low-similarity retrieval matches -- the assistant answers even when the best-matching chunk is a poor match.",
                "severity": "medium",
            },
            {
                "requirement_reference": "engineering_practices",
                "gap_description": "No re-indexing trigger when the catalog changes -- new products are queryable only after a manual reindex, with no monitoring for staleness.",
                "severity": "medium",
            },
        ],
        "memory_entry_id": "demo-mem-ceo-1",
        "audit_log_id": "demo-audit-ceo-1",
    },
    "monitor_status": {
        "track_a": {"running": True, "next_run": "2026-06-25T04:00:00Z"},
        "track_b": {"running": True, "next_run": "2026-06-25T08:00:00Z"},
        "track_c": {"running": True, "next_run": "2026-06-26T03:00:00Z"},
    },
    "cost_intelligence": {
        "project_id": DEMO_PROJECT_ID,
        "budget_usd": 120.0,
        "over_budget": True,
        "total_cost_usd": 38.71,
        "projected_monthly_usd": 187.40,
        "days_elapsed": 6.2,
    },
    "fix_patterns": [
        {
            "issue_type": "cost_overrun",
            "root_cause_pattern": "chunk_size set conservatively in Stage 2 stops matching real usage once catalog/traffic grows past the original estimate.",
            "fix_template": "Recompute chunk_size and reindex against current catalog size; add a monitor that re-checks this ratio monthly instead of assuming it stays valid.",
            "success_rate": 1.0,
            "project_count": 5,
            "updated_at": "2026-06-20T10:00:00Z",
        },
        {
            "issue_type": "hallucination",
            "root_cause_pattern": "Structured fields (variants, policy exceptions) omitted from embedded chunk text cause confident-sounding wrong answers on exactly those fields.",
            "fix_template": "Route known structured-field questions to a direct lookup instead of RAG, and include the field explicitly in the embedded text for everything else.",
            "success_rate": 0.92,
            "project_count": 8,
            "updated_at": "2026-06-22T14:30:00Z",
        },
    ],
    "compliance_report": {
        "project_id": DEMO_PROJECT_ID,
        "generated_at": "2026-06-23T09:00:00Z",
        "gdpr_evidence": [
            "3 security- and data-related architectural decisions recorded with timestamp and reasoning (accountability principle).",
            "Per-project data isolation enforced at both the database and vector-store layers (security of processing).",
            "Complete, immutable audit trail: 14 recorded actions for this project (records of processing activity).",
        ],
        "dpdp_evidence": [
            "Every access to project data is authenticated, authorized, and logged.",
            "1 recorded decision specifically addressing sensitive-data handling (refund/return policy isolation from general RAG).",
        ],
        "soc2_evidence": [
            "Security: all API access requires a valid JWT; every endpoint is rate-limited; ownership is verified before any project-scoped read or write.",
            "Availability: monitoring jobs run on a scheduler with crash detection.",
            "Processing integrity: all database writes use parameterized queries; LLM-generated output is schema-validated before being trusted or stored.",
            "Confidentiality: secrets are sanitized before reaching any LLM call.",
        ],
        "security_decision_history": [
            {
                "timestamp": "2026-06-02T16:40:00Z",
                "stage": "stage_7_sdk",
                "content": "Refund and return-policy questions are answered from a fixed, human-reviewed FAQ document, never from the general product-catalog RAG pipeline.",
            },
        ],
        "data_isolation_proof": [
            "Every project-scoped query is filtered by owner_id, verified against the requester's JWT before any data is returned.",
            "Semantic memory search is filtered by project_id on every query.",
        ],
        "access_control_log_sample": [
            {"actor_id": "demo-owner", "action": "GET /api/v1/projects/demo-shopgenie/issues", "outcome": "allowed", "created_at": "2026-06-23T08:55:00Z"},
        ],
        "access_control_log_total_entries": 14,
        "disclaimer": "This is demo data for illustration -- not a real compliance attestation.",
        "snapshot_id": "demo-snapshot-1",
    },
}


@router.get("")
@limiter.limit("30/minute")
def get_demo_data(request: Request, response: Response):
    return _DEMO_DATA
