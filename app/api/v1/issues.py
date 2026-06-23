from fastapi import APIRouter, Request

from app.core.ownership import verify_project_owner
from app.db.database import get_connection

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
                       fix_applied, verified, time_to_resolve_mins
                FROM issues
                WHERE project_id = %s::uuid
                ORDER BY detected_at DESC
                """,
                (project_id,),
            )
            columns = [col.name for col in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]
