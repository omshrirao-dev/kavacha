from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, field_validator

from app.core.accounts import account_status, extend_trial
from app.core.audit import log_access
from app.core.config import get_supabase_admin_client
from app.core.limiter import limiter
from app.core.scheduler import stop_monitoring
from app.core.sessions import list_active_sessions, revoke_all
from app.db.database import get_connection
from app.memory.client import get_collection

router = APIRouter(prefix="/api/v1/user", tags=["user"])

_DISPLAY_NAME_MAX_LEN = 100
_BEST_FEATURE_MAX_LEN = 100
_IMPROVEMENT_MAX_LEN = 1000


class ProfileUpdateRequest(BaseModel):
    display_name: str

    @field_validator("display_name")
    @classmethod
    def _bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _DISPLAY_NAME_MAX_LEN):
            raise ValueError(f"display_name must be between 1 and {_DISPLAY_NAME_MAX_LEN} characters")
        return v


class FeedbackRequest(BaseModel):
    rating: int
    best_feature: str | None = None
    improvement: str | None = None

    @field_validator("rating")
    @classmethod
    def _rating_bounds(cls, v: int) -> int:
        if not (1 <= v <= 5):
            raise ValueError("rating must be between 1 and 5")
        return v

    @field_validator("best_feature")
    @classmethod
    def _best_feature_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > _BEST_FEATURE_MAX_LEN:
            raise ValueError(f"best_feature must be at most {_BEST_FEATURE_MAX_LEN} characters")
        return v

    @field_validator("improvement")
    @classmethod
    def _improvement_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > _IMPROVEMENT_MAX_LEN:
            raise ValueError(f"improvement must be at most {_IMPROVEMENT_MAX_LEN} characters")
        return v


_EMAIL_CONFIRMATION_MAX_LEN = 254  # matches auth.py's RFC 5321 cap


class AccountDeleteRequest(BaseModel):
    email_confirmation: str

    @field_validator("email_confirmation")
    @classmethod
    def _bounds(cls, v: str) -> str:
        if len(v) > _EMAIL_CONFIRMATION_MAX_LEN:
            raise ValueError(f"email_confirmation must be at most {_EMAIL_CONFIRMATION_MAX_LEN} characters")
        return v


@router.get("/profile")
def get_profile(request: Request):
    """The verified JWT itself already carries email + user_metadata (set at
    sign-up, or by Google for OAuth users) -- no extra Supabase Admin API
    call needed just to read what this request already proved."""
    payload = request.state.user
    user_metadata = payload.get("user_metadata") or {}
    return {
        "id": payload["sub"],
        "email": payload.get("email"),
        "display_name": user_metadata.get("display_name") or user_metadata.get("full_name"),
    }


@router.put("/profile")
@limiter.limit("20/hour")
def update_profile(request: Request, response: Response, body: ProfileUpdateRequest):
    owner_id = request.state.user["sub"]
    # display_name lives in Supabase's own user_metadata, not a Kavacha table
    # -- updating it requires the service-role admin API. Uses a dedicated
    # client (see get_supabase_admin_client's docstring), not the one
    # /api/v1/auth/login shares for sign_in_with_password.
    get_supabase_admin_client().auth.admin.update_user_by_id(owner_id, {"user_metadata": {"display_name": body.display_name}})
    log_access(actor_id=owner_id, action="user_profile_updated", outcome="success")
    return {"display_name": body.display_name}


@router.get("/account-status")
def get_account_status(request: Request):
    owner_id = request.state.user["sub"]
    return account_status(owner_id)


@router.post("/feedback")
@limiter.limit("5/hour")
def submit_feedback(request: Request, response: Response, body: FeedbackRequest):
    """Day-10 trial survey. Submitting one extends the trial by 15 days
    (app/core/accounts.py's extend_trial(), a no-op if already extended) --
    the whole point is to reward real feedback with more time to evaluate,
    not to gate it behind a form nobody has a reason to fill in."""
    owner_id = request.state.user["sub"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO user_feedback (user_id, rating, best_feature, improvement) VALUES (%s::uuid, %s, %s, %s)",
                (owner_id, body.rating, body.best_feature, body.improvement),
            )
    extend_trial(owner_id)
    log_access(actor_id=owner_id, action="user_feedback_submitted", outcome="success")
    return account_status(owner_id)


@router.get("/sessions")
def get_sessions(request: Request):
    owner_id = request.state.user["sub"]
    return {"sessions": list_active_sessions(owner_id)}


@router.post("/sessions/revoke-all")
@limiter.limit("10/hour")
def revoke_all_sessions(request: Request, response: Response):
    """Real, immediate enforcement, not just a database flag: passes the
    CALLER's OWN current JWT (never one we stored -- Rule 1) to Supabase's
    admin.sign_out(scope="global"), which revokes every refresh token for
    this user. Every other device is forced to re-authenticate the next time
    its access token needs refreshing -- bounded by that token's own
    remaining lifetime (JWT hardening's short expiry) until then."""
    owner_id = request.state.user["sub"]
    auth_header = request.headers.get("Authorization", "")
    raw_jwt = auth_header.removeprefix("Bearer ").strip()

    get_supabase_admin_client().auth.admin.sign_out(raw_jwt, scope="global")
    revoke_all(owner_id)
    log_access(actor_id=owner_id, action="user_sessions_revoked", outcome="success")
    return {"status": "revoked"}


@router.delete("/account")
@limiter.limit("5/hour")
def delete_account(request: Request, response: Response, body: AccountDeleteRequest):
    """Highest-risk endpoint in this upgrade: irreversible, deletes every
    project the user owns and then the Supabase auth user itself. The
    frontend requires typing the account's own email to confirm -- re-checked
    here server-side rather than trusted from the client alone. Project rows
    are deleted (and the vector store cleaned up) before the auth user, so a
    failure mid-way leaves "logged in with no data" rather than an orphaned,
    inaccessible account -- and a retry is safe (nothing left to re-delete)."""
    owner_id = request.state.user["sub"]
    own_email = (request.state.user.get("email") or "").lower().strip()
    if body.email_confirmation.lower().strip() != own_email:
        raise HTTPException(status_code=400, detail="Email confirmation does not match your account email")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM projects WHERE owner_id = %s::uuid", (owner_id,))
            project_ids = [str(row[0]) for row in cur.fetchall()]

    for project_id in project_ids:
        stop_monitoring(project_id)
        get_collection().delete(where={"project_id": project_id})

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM projects WHERE owner_id = %s::uuid", (owner_id,))

    log_access(actor_id=owner_id, action="user_account_deleted", outcome="success", metadata={"projects_deleted": len(project_ids)})

    get_supabase_admin_client().auth.admin.delete_user(owner_id)

    return {"status": "deleted"}
