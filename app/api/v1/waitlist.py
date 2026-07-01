from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, EmailStr, field_validator

from app.core.audit import log_access
from app.core.limiter import limiter
from app.db.database import get_connection

router = APIRouter(prefix="/api/v1/waitlist", tags=["waitlist"])

_SOURCE_MAX_LEN = 100


class WaitlistJoinRequest(BaseModel):
    email: EmailStr
    source: str | None = None

    @field_validator("email")
    @classmethod
    def _email_max_length(cls, v: str) -> str:
        if len(v) > 254:
            raise ValueError("email too long")
        return v.lower().strip()

    @field_validator("source")
    @classmethod
    def _source_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > _SOURCE_MAX_LEN:
            raise ValueError(f"source must be at most {_SOURCE_MAX_LEN} characters")
        return v


@router.post("")
@limiter.limit("10/hour")
def join_waitlist(request: Request, response: Response, body: WaitlistJoinRequest):
    owner_id = request.state.user["sub"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO waitlist (email, source) VALUES (%s, %s)",
                (body.email, body.source),
            )
    log_access(actor_id=owner_id, action="waitlist_joined", outcome="success", metadata={"source": body.source})
    return {"status": "joined"}
