from fastapi import APIRouter, Request

from app.db.database import get_connection

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


@router.get("")
def list_projects(request: Request):
    owner_id = request.state.user["sub"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    p.id, p.name, p.status, p.created_at,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM issues i
                            WHERE i.project_id = p.id AND i.verified = false AND i.severity = 'CRITICAL'
                        ) THEN 'red'
                        WHEN EXISTS (
                            SELECT 1 FROM issues i
                            WHERE i.project_id = p.id AND i.verified = false AND i.severity = 'WARNING'
                        ) THEN 'yellow'
                        ELSE 'green'
                    END AS health
                FROM projects p
                WHERE p.owner_id = %s::uuid
                ORDER BY p.created_at DESC
                """,
                (owner_id,),
            )
            columns = [col.name for col in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]
