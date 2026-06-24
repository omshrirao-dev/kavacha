import json

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.core.limiter import limiter
from app.db.database import get_connection
from app.memory.engine import store_memory

router = APIRouter(prefix="/api/v1/sdk", tags=["sdk"])


class LogDecisionRequest(BaseModel):
    decision: str
    reason: str
    layer: str | None = None


class WatchEventRequest(BaseModel):
    success: bool
    latency_ms: int | None = None
    error_type: str | None = None


@router.get("/ping")
@limiter.limit("30/minute")
def ping(request: Request, response: Response):
    project_id = request.state.api_key_project_id
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM projects WHERE id = %s::uuid", (project_id,))
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "ok", "project_id": project_id, "project_name": row[0]}


@router.post("/decisions")
@limiter.limit("30/minute")
def log_decision(request: Request, response: Response, body: LogDecisionRequest):
    project_id = request.state.api_key_project_id
    # source="human" -- this is the developer recording their OWN decision via
    # the SDK, distinct from "ai" entries the Architect/CEO Review/Fix Engine
    # generate. The same project_memory table, the distinction the schema
    # already had a column for since Day 1.
    memory_id = store_memory(
        project_id=project_id,
        stage="stage_7_sdk",
        content=f"{body.decision}\n\nReason: {body.reason}",
        layer=body.layer,
        decision_type="developer_decision",
        impact_level=None,
        source="human",
    )
    return {"memory_entry_id": memory_id}


@router.post("/watch-events")
@limiter.limit("120/minute")
def log_watch_event(request: Request, response: Response, body: WatchEventRequest):
    project_id = request.state.api_key_project_id
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sdk_events (project_id, event_type, success, latency_ms, metadata)
                VALUES (%s::uuid, 'watch_call', %s, %s, %s)
                """,
                (
                    project_id,
                    body.success,
                    body.latency_ms,
                    json.dumps({"error_type": body.error_type}) if body.error_type else None,
                ),
            )
    return {"status": "recorded"}
