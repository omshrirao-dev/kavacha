from fastapi import APIRouter, Request

from app.db.database import get_connection

router = APIRouter(prefix="/api/v1/fix-patterns", tags=["fix_patterns"])


@router.get("")
def list_fix_patterns(request: Request):
    # Global, not project-scoped -- these are aggregate, anonymized patterns
    # (issue_type + root cause shape), not raw client data, so any
    # authenticated user can see them. Still requires a valid JWT (Rule 8).
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT issue_type, root_cause_pattern, fix_template, success_rate, project_count, updated_at
                FROM fix_patterns ORDER BY project_count DESC
                """
            )
            columns = [col.name for col in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]
