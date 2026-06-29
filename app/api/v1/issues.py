from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response

from app.core.audit import log_access
from app.core.limiter import limiter
from app.core.notifier import format_issue_notification, resolve_notification_email, send_notification, should_notify
from app.core.ownership import verify_project_owner
from app.db.database import get_connection
from app.services.fix_engine import apply_pending_fix, mark_issue_dismissed, mark_issue_verified
from app.services.monitor_agent import reverify_pending_fix

router = APIRouter(prefix="/api/v1/projects/{project_id}/issues", tags=["issues"])


@router.get("")
def list_issues(project_id: str, request: Request):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, detected_at, type, severity, description, root_cause,
                       fix_applied, verified, time_to_resolve_mins, dismissed,
                       proposed_fix_description, estimated_cost_impact
                FROM issues
                WHERE project_id = %s::uuid
                ORDER BY detected_at DESC
                """,
                (project_id,),
            )
            columns = [col.name for col in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]


@router.post("/{issue_id}/apply-fix")
@limiter.limit("20/hour")
def apply_fix(project_id: str, issue_id: str, request: Request, response: Response):
    """Rule 7: human approval for the CRITICAL fixes diagnose_and_maybe_apply_fix
    left pending. Applies the fix, then re-verifies using whatever
    pending_fix_context recorded (Track A re-runs its test query; Track B/C
    have nothing further to check), exactly mirroring the non-pending path
    already in monitor_agent.py's run_track_a/b/c."""
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    try:
        result = apply_pending_fix(issue_id=issue_id, project_id=project_id, owner_id=owner_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    verified = reverify_pending_fix(project_id, result["pending_fix_context"])
    mark_issue_verified(issue_id, verified, result["elapsed_minutes"])

    notification = format_issue_notification(
        detected_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        plain_english_summary=f"You approved the proposed fix for: {result['root_cause']}",
        root_cause=result["root_cause"],
        fix_description=result["fix_description"],
        verified=verified,
    )
    if should_notify(project_id):
        send_notification(
            owner_id,
            subject="Kavacha applied your approved fix" if verified else "Kavacha applied your approved fix -- verification failed",
            message=notification,
            email_override=resolve_notification_email(project_id, owner_id),
        )

    return {
        "issue_id": issue_id,
        "root_cause": result["root_cause"],
        "fix_description": result["fix_description"],
        "verified": verified,
    }


@router.post("/{issue_id}/dismiss")
@limiter.limit("30/hour")
def dismiss_issue(project_id: str, issue_id: str, request: Request, response: Response):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    found = mark_issue_dismissed(issue_id, project_id)
    if not found:
        raise HTTPException(status_code=404, detail="Issue not found")

    log_access(actor_id=owner_id, action="issue_dismissed", outcome="success", resource=project_id, metadata={"issue_id": issue_id})
    return {"issue_id": issue_id, "dismissed": True}
