from fastapi import APIRouter, HTTPException, Request, Response

from app.core.api_keys import generate_api_key
from app.core.audit import log_access
from app.core.limiter import limiter
from app.core.ownership import verify_project_owner
from app.db.database import get_connection

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

_HEALTH_CASE_SQL = """
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
"""


@router.get("")
def list_projects(request: Request):
    owner_id = request.state.user["sub"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT p.id, p.name, p.status, p.created_at, {_HEALTH_CASE_SQL}
                FROM projects p
                WHERE p.owner_id = %s::uuid
                ORDER BY p.created_at DESC
                """,
                (owner_id,),
            )
            columns = [col.name for col in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]


@router.get("/{project_id}")
def get_project(project_id: str, request: Request):
    owner_id = request.state.user["sub"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT p.id, p.name, p.status, p.created_at, {_HEALTH_CASE_SQL}
                FROM projects p
                WHERE p.id = %s::uuid AND p.owner_id = %s::uuid
                """,
                (project_id, owner_id),
            )
            columns = [col.name for col in cur.description]
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return dict(zip(columns, row, strict=True))


@router.post("/{project_id}/api-keys")
@limiter.limit("10/hour")
def create_api_key(project_id: str, request: Request, response: Response):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)
    raw_key = generate_api_key(project_id)
    log_access(actor_id=owner_id, action="api_key_created", outcome="success", resource=project_id)
    # The ONLY time this raw key is ever returned -- only the hash is stored.
    return {"api_key": raw_key, "project_id": project_id}


@router.get("/{project_id}/api-keys")
def list_api_keys(project_id: str, request: Request):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, key_prefix, created_at, last_used_at, revoked
                FROM api_keys WHERE project_id = %s::uuid ORDER BY created_at DESC
                """,
                (project_id,),
            )
            columns = [col.name for col in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]
