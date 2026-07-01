import json

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, field_validator

from app.core.accounts import EventLimitExceeded, enforce_event_limit
from app.core.limiter import limiter
from app.db.database import get_connection
from app.memory.engine import store_memory

router = APIRouter(prefix="/api/v1/sdk", tags=["sdk"])

FREE_TIER_EVENT_LIMIT_MESSAGE = "Free tier event limit reached for this month -- join the waitlist for paid plans or wait for next month's reset."


def _resolve_owner_id(project_id: str) -> str | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT owner_id FROM projects WHERE id = %s::uuid", (project_id,))
            row = cur.fetchone()
    return str(row[0]) if row else None

# Generous but bounded, same spirit as projects.py's _DESCRIPTION_MAX_LEN --
# decision/reason flow into project_memory.content (an unbounded TEXT column
# today) and get read back into LLM context, so an upper bound here is
# directly cost/DoS relevant, not just cosmetic.
_DECISION_MAX_LEN = 5000
_REASON_MAX_LEN = 5000
_LAYER_MAX_LEN = 100
_ERROR_TYPE_MAX_LEN = 200


class LogDecisionRequest(BaseModel):
    decision: str
    reason: str
    layer: str | None = None

    @field_validator("decision")
    @classmethod
    def _decision_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _DECISION_MAX_LEN):
            raise ValueError(f"decision must be between 1 and {_DECISION_MAX_LEN} characters")
        return v

    @field_validator("reason")
    @classmethod
    def _reason_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _REASON_MAX_LEN):
            raise ValueError(f"reason must be between 1 and {_REASON_MAX_LEN} characters")
        return v

    @field_validator("layer")
    @classmethod
    def _layer_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > _LAYER_MAX_LEN:
            raise ValueError(f"layer must be at most {_LAYER_MAX_LEN} characters")
        return v


class WatchEventRequest(BaseModel):
    success: bool
    latency_ms: int | None = None
    error_type: str | None = None

    @field_validator("latency_ms")
    @classmethod
    def _latency_non_negative(cls, v: int | None) -> int | None:
        if v is not None and v < 0:
            raise ValueError("latency_ms must be non-negative")
        return v

    @field_validator("error_type")
    @classmethod
    def _error_type_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > _ERROR_TYPE_MAX_LEN:
            raise ValueError(f"error_type must be at most {_ERROR_TYPE_MAX_LEN} characters")
        return v


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

    owner_id = _resolve_owner_id(project_id)
    if owner_id is not None:
        try:
            enforce_event_limit(owner_id)
        except EventLimitExceeded:
            raise HTTPException(status_code=429, detail=FREE_TIER_EVENT_LIMIT_MESSAGE)

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
