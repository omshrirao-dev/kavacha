from fastapi import APIRouter, Query, Request

from app.core.ownership import verify_project_owner
from app.db.database import get_connection
from app.memory.engine import search_memory

router = APIRouter(prefix="/api/v1/projects/{project_id}/memory", tags=["memory"])


@router.get("")
def list_memory(project_id: str, request: Request):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, stage, layer, content, decision_type, impact_level, timestamp, source
                FROM project_memory
                WHERE project_id = %s::uuid
                ORDER BY timestamp DESC
                """,
                (project_id,),
            )
            columns = [col.name for col in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]


@router.get("/search")
def search_project_memory(project_id: str, request: Request, q: str = Query(..., min_length=1)):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)
    return search_memory(project_id, q, n_results=10)
