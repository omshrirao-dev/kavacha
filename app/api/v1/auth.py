import logging

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, field_validator
from supabase_auth.errors import AuthApiError

from app.core.audit import log_access
from app.core.config import get_supabase_client
from app.core.limiter import limiter
from app.core.login_security import is_locked, record_failed_attempt, reset_attempts

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
logger = logging.getLogger("kavacha.auth")

# Rule: a login failure must ALWAYS say exactly this, regardless of whether
# the email doesn't exist, the password is wrong, or anything else about the
# account -- different error text is how attackers enumerate which emails
# have accounts. Verified live that Supabase's own API already returns the
# same generic message for both cases; this is normalized here so it never
# depends on what an upstream provider happens to return.
GENERIC_LOGIN_ERROR = "Incorrect email or password"
LOCKED_MESSAGE = "Too many attempts. Try again later."


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def _email_max_length(cls, v: str) -> str:
        # RFC 5321 caps an email address at 254 characters -- reject before
        # it ever reaches a database query or an upstream auth call.
        if len(v) > 254:
            raise ValueError("email too long")
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def _password_length(cls, v: str) -> str:
        if not (8 <= len(v) <= 128):
            raise ValueError("password must be between 8 and 128 characters")
        return v


@router.post("/login")
@limiter.limit("10/minute")
def login(payload: LoginRequest, request: Request, response: Response):
    email = payload.email
    client_ip = request.client.host if request.client else "unknown"

    if is_locked(email):
        log_access(actor_id=email, action="login_attempt", outcome="locked_out", metadata={"ip": client_ip})
        raise HTTPException(status_code=429, detail=LOCKED_MESSAGE)

    try:
        auth_response = get_supabase_client().auth.sign_in_with_password(
            {"email": email, "password": payload.password}
        )
    except AuthApiError:
        locked_now = record_failed_attempt(email)
        log_access(
            actor_id=email,
            action="login_attempt",
            outcome="locked_out" if locked_now else "failure",
            metadata={"ip": client_ip},
        )
        # Same message whether this attempt just tripped the lockout or not
        # -- the account-existence/lockout distinction is never exposed.
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)

    reset_attempts(email)
    log_access(actor_id=email, action="login_attempt", outcome="success", metadata={"ip": client_ip})

    session = auth_response.session
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_at": session.expires_at,
    }
