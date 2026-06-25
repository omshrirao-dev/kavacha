import re

from fastapi import APIRouter, Request

from app.db.database import get_connection

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

# Matches the exact format run_track_b() in monitor_agent.py writes --
# parsing it back out is safe specifically because this app controls and
# wrote that format string itself (unlike parsing arbitrary LLM or user
# text, which is what caused the Day 17-18 budget-regex bug).
_COST_OVERRUN_RE = re.compile(
    r"Projected monthly cost \$([\d.]+) exceeds the Stage 2 approved budget of \$([\d.]+)"
)
_USD_TO_INR = 83


@router.get("/summary")
def get_dashboard_summary(request: Request):
    owner_id = request.state.user["sub"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM projects WHERE owner_id = %s::uuid", (owner_id,))
            projects_monitored = cur.fetchone()[0]

            cur.execute(
                """
                SELECT count(*) FROM issues i
                JOIN projects p ON p.id = i.project_id
                WHERE p.owner_id = %s::uuid AND i.detected_at::date = current_date
                """,
                (owner_id,),
            )
            issues_today = cur.fetchone()[0]

            cur.execute(
                """
                SELECT count(*), count(*) FILTER (WHERE i.verified)
                FROM issues i
                JOIN projects p ON p.id = i.project_id
                WHERE p.owner_id = %s::uuid AND i.fix_applied
                """,
                (owner_id,),
            )
            fixes_applied, fixes_verified = cur.fetchone()
            fix_success_rate = (fixes_verified / fixes_applied) if fixes_applied else None

            # fix_patterns is deliberately global (no project_id, no owner
            # scoping) -- the whole point of cross-project learning is that
            # it isn't scoped to any one account.
            cur.execute("SELECT count(*) FROM fix_patterns")
            patterns_learned = cur.fetchone()[0]

            cur.execute(
                """
                SELECT i.description FROM issues i
                JOIN projects p ON p.id = i.project_id
                WHERE p.owner_id = %s::uuid AND i.type = 'cost_overrun'
                """,
                (owner_id,),
            )
            cost_overrun_descriptions = [row[0] for row in cur.fetchall()]

            cur.execute(
                "SELECT count(*) FROM compliance_snapshots cs JOIN projects p ON p.id = cs.project_id WHERE p.owner_id = %s::uuid",
                (owner_id,),
            )
            compliance_reports_ready = cur.fetchone()[0]

    overrun_inr_caught = 0.0
    for description in cost_overrun_descriptions:
        match = _COST_OVERRUN_RE.search(description)
        if match:
            projected, budget = float(match.group(1)), float(match.group(2))
            overrun_inr_caught += max(projected - budget, 0) * _USD_TO_INR

    return {
        "projects_monitored": projects_monitored,
        "issues_today": issues_today,
        "fixes_applied": fixes_applied,
        "fix_success_rate": fix_success_rate,
        "patterns_learned": patterns_learned,
        "cost_overruns_caught": len(cost_overrun_descriptions),
        "cost_overrun_inr_caught": round(overrun_inr_caught, 2),
        "compliance_reports_ready": compliance_reports_ready,
    }
