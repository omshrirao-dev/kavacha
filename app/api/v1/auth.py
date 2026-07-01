import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, field_validator
from supabase_auth.errors import AuthApiError

from app.core.audit import log_access
from app.core.captcha import verify_captcha
from app.core.config import get_supabase_client
from app.core.limiter import limiter
from app.core.login_security import (
    CAPTCHA_REQUIRED_AFTER_ATTEMPTS,
    get_attempt_count,
    is_locked,
    record_failed_attempt,
    reset_attempts,
    retry_after_seconds,
)
from app.core.notifier import format_new_login_notification, send_notification
from app.core.sessions import record_login

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
CAPTCHA_REQUIRED_MESSAGE = "CAPTCHA verification required"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    # Optional and inert until HCAPTCHA_SECRET_KEY is configured -- see
    # app/core/captcha.py. The frontend only needs to render the widget and
    # populate this field once verify_captcha() is actually enforcing.
    hcaptcha_token: str | None = None

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
    user_agent = request.headers.get("user-agent", "")

    locked_until = is_locked(email)
    if locked_until is not None:
        log_access(actor_id=email, action="login_attempt", outcome="locked_out", metadata={"ip": client_ip})
        raise HTTPException(
            status_code=429,
            detail=LOCKED_MESSAGE,
            headers={"Retry-After": str(retry_after_seconds(locked_until))},
        )

    if get_attempt_count(email) >= CAPTCHA_REQUIRED_AFTER_ATTEMPTS and not verify_captcha(payload.hcaptcha_token):
        log_access(actor_id=email, action="login_attempt", outcome="captcha_required", metadata={"ip": client_ip})
        raise HTTPException(status_code=400, detail=CAPTCHA_REQUIRED_MESSAGE)

    try:
        auth_response = get_supabase_client().auth.sign_in_with_password(
            {"email": email, "password": payload.password}
        )
    except AuthApiError:
        locked_until = record_failed_attempt(email)
        log_access(
            actor_id=email,
            action="login_attempt",
            outcome="locked_out" if locked_until else "failure",
            metadata={"ip": client_ip},
        )
        # Same message whether this attempt just tripped the lockout or not
        # -- the account-existence/lockout distinction is never exposed.
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)

    reset_attempts(email)
    log_access(actor_id=email, action="login_attempt", outcome="success", metadata={"ip": client_ip})

    user_id = auth_response.user.id
    is_new_device = record_login(user_id, client_ip, user_agent)
    if is_new_device:
        when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        try:
            send_notification(user_id, "Kavacha: new login to your account", format_new_login_notification(client_ip, when))
        except Exception:
            logger.exception("new-login notification failed for user %s", user_id)

    session = auth_response.session
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_at": session.expires_at,
    }
