from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, field_validator

from app.core.accounts import ProjectLimitExceeded, enforce_project_limit
from app.core.api_keys import generate_api_key
from app.core.audit import log_access
from app.core.limiter import limiter
from app.core.ownership import verify_project_owner
from app.core.sanitize_html import strip_html
from app.core.scheduler import start_monitoring, stop_monitoring
from app.db.database import get_connection
from app.memory.client import get_collection

FREE_TIER_PROJECT_LIMIT_MESSAGE = "Free tier is limited to 1 project -- join the waitlist for paid plans or contact support to discuss your case."

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

# Generous but bounded -- these are display fields a human typed into a form,
# not anything that needs to support arbitrary document-length text. Same
# spirit as auth.py's email/password length validators: reject obviously
# abusive input before it ever reaches a database write.
_NAME_MAX_LEN = 200
_DESCRIPTION_MAX_LEN = 2000
_URL_MAX_LEN = 500


class ProjectCreateRequest(BaseModel):
    name: str
    description: str | None = None
    ai_model: str | None = None
    framework: str | None = None
    monthly_budget: float | None = None
    deployed_url: str | None = None

    @field_validator("name")
    @classmethod
    def _name_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _NAME_MAX_LEN):
            raise ValueError(f"name must be between 1 and {_NAME_MAX_LEN} characters")
        return strip_html(v)

    @field_validator("ai_model", "framework")
    @classmethod
    def _short_field_bounds(cls, v: str | None) -> str | None:
        if v is not None and len(v) > _DESCRIPTION_MAX_LEN:
            raise ValueError(f"must be at most {_DESCRIPTION_MAX_LEN} characters")
        return v

    @field_validator("description")
    @classmethod
    def _description_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v) > _DESCRIPTION_MAX_LEN:
            raise ValueError(f"description must be at most {_DESCRIPTION_MAX_LEN} characters")
        return strip_html(v)

    @field_validator("deployed_url")
    @classmethod
    def _url_bounds(cls, v: str | None) -> str | None:
        if v is not None and len(v) > _URL_MAX_LEN:
            raise ValueError(f"deployed_url must be at most {_URL_MAX_LEN} characters")
        return v

    @field_validator("monthly_budget")
    @classmethod
    def _budget_non_negative(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("monthly_budget must be non-negative")
        return v


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    monthly_budget: float | None = None
    deployed_url: str | None = None
    notification_email: EmailStr | None = None
    alerts_enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def _name_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not (1 <= len(v) <= _NAME_MAX_LEN):
            raise ValueError(f"name must be between 1 and {_NAME_MAX_LEN} characters")
        return strip_html(v)

    @field_validator("description")
    @classmethod
    def _description_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v) > _DESCRIPTION_MAX_LEN:
            raise ValueError(f"description must be at most {_DESCRIPTION_MAX_LEN} characters")
        return strip_html(v)

    @field_validator("deployed_url")
    @classmethod
    def _url_bounds(cls, v: str | None) -> str | None:
        if v is not None and len(v) > _URL_MAX_LEN:
            raise ValueError(f"deployed_url must be at most {_URL_MAX_LEN} characters")
        return v

    @field_validator("monthly_budget")
    @classmethod
    def _budget_non_negative(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("monthly_budget must be non-negative")
        return v


class PauseRequest(BaseModel):
    paused: bool


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


@router.post("")
@limiter.limit("20/hour")
def create_project(request: Request, response: Response, body: ProjectCreateRequest):
    """Self-serve project creation (Real-Product Upgrade onboarding) --
    unlike /api/v1/architect/run, this never calls an LLM: it's a plain CRUD
    insert plus a first API key, exactly what the onboarding form and
    "+ Add New Project" need. The key is returned exactly once, same
    guarantee as POST .../api-keys."""
    owner_id = request.state.user["sub"]

    try:
        enforce_project_limit(owner_id)
    except ProjectLimitExceeded:
        raise HTTPException(status_code=403, detail=FREE_TIER_PROJECT_LIMIT_MESSAGE)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO projects (name, owner_id, description, ai_model, framework, monthly_budget, deployed_url)
                VALUES (%s, %s::uuid, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (body.name, owner_id, body.description, body.ai_model, body.framework, body.monthly_budget, body.deployed_url),
            )
            project_id = str(cur.fetchone()[0])

    raw_key = generate_api_key(project_id)
    log_access(actor_id=owner_id, action="project_created", outcome="success", resource=project_id)
    return {"project_id": project_id, "api_key": raw_key}


@router.get("/{project_id}")
def get_project(project_id: str, request: Request):
    """The list view (list_projects above) only needs enough for a project
    card; this single-project view backs the Overview/SDK Setup/Settings
    tabs, which need the full editable shape -- so it selects every column
    those tabs read or pre-fill a form from."""
    owner_id = request.state.user["sub"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT p.id, p.name, p.status, p.created_at, p.description, p.ai_model, p.framework,
                       p.monthly_budget, p.deployed_url, p.notification_email, p.alerts_enabled,
                       p.monitoring_paused, {_HEALTH_CASE_SQL}
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


@router.get("/{project_id}/connection-status")
@limiter.limit("60/minute")
def connection_status(project_id: str, request: Request, response: Response):
    """Polled every 5s by the onboarding flow's "waiting for first event"
    indicator, and read once by the SDK Setup tab. Existence-based, not
    recency-based -- once any sdk_event has ever arrived, connected stays
    true permanently (no flapping back to "not connected" between calls)."""
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT max(created_at) FROM sdk_events WHERE project_id = %s::uuid", (project_id,))
            last_event = cur.fetchone()[0]
    return {"connected": last_event is not None, "last_event": last_event}


@router.put("/{project_id}")
@limiter.limit("30/hour")
def update_project(project_id: str, request: Request, response: Response, body: ProjectUpdateRequest):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Column names come only from ProjectUpdateRequest's own declared fields
    # (never from arbitrary request data), so building the SET clause from
    # `fields.keys()` is safe -- every value is still bound as a parameter.
    set_clauses = ", ".join(f"{column} = %s" for column in fields)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE projects SET {set_clauses} WHERE id = %s::uuid AND owner_id = %s::uuid",
                (*fields.values(), project_id, owner_id),
            )

    log_access(actor_id=owner_id, action="project_updated", outcome="success", resource=project_id, metadata={"fields": list(fields.keys())})
    return {"project_id": project_id, "updated_fields": list(fields.keys())}


@router.put("/{project_id}/pause")
@limiter.limit("30/hour")
def pause_project(project_id: str, request: Request, response: Response, body: PauseRequest):
    """Persists monitoring_paused (unlike POST /monitor/start|stop, which only
    touch the in-memory APScheduler job) so a redeploy doesn't silently
    resume a project the owner explicitly paused -- see the startup re-arm
    hook in app/main.py."""
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE projects SET monitoring_paused = %s WHERE id = %s::uuid", (body.paused, project_id))

    if body.paused:
        stop_monitoring(project_id)
    else:
        start_monitoring(project_id)

    log_access(actor_id=owner_id, action="project_pause_toggle", outcome="paused" if body.paused else "resumed", resource=project_id)
    return {"project_id": project_id, "monitoring_paused": body.paused}


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


@router.post("/{project_id}/api-keys/regenerate")
@limiter.limit("10/hour")
def regenerate_api_key(project_id: str, request: Request, response: Response):
    """Revokes every currently-active key for this project, then issues one
    new key -- used when an old key may have leaked. The new key is returned
    exactly once, same guarantee as project creation and the plain create
    endpoint above."""
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE api_keys SET revoked = true WHERE project_id = %s::uuid AND revoked = false", (project_id,))

    raw_key = generate_api_key(project_id)
    log_access(actor_id=owner_id, action="api_key_regenerated", outcome="success", resource=project_id)
    return {"api_key": raw_key, "project_id": project_id}


@router.delete("/{project_id}")
@limiter.limit("10/hour")
def delete_project(project_id: str, request: Request, response: Response):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    stop_monitoring(project_id)
    # Postgres FKs (ON DELETE CASCADE) clean up project_memory/issues/etc.
    # automatically -- the vector store is a separate system with no such
    # guarantee, so it needs its own explicit cleanup, same as the test
    # suite's _cleanup_project helper.
    get_collection().delete(where={"project_id": project_id})

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM projects WHERE id = %s::uuid AND owner_id = %s::uuid", (project_id, owner_id))

    log_access(actor_id=owner_id, action="project_deleted", outcome="success", resource=project_id)
    return {"project_id": project_id, "status": "deleted"}
