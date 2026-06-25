import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.api_keys import verify_api_key
from app.core.audit import log_access
from app.core.security import InvalidTokenError, verify_supabase_jwt

PROTECTED_PREFIX = "/api/v1"
SDK_PREFIX = "/api/v1/sdk"
# /auth/login: must be reachable with no credential at all -- it's how a
# credential gets issued in the first place. Its own rate limiting and
# lockout logic (app/core/login_security.py) is what defends it.
# /demo: intentionally public -- static, hardcoded fixture data, no database
# query at all (app/api/v1/demo.py), so there's nothing here for auth to
# protect. Rate limited the same as everything else.
PUBLIC_PATHS = {"/api/v1/auth/login", "/api/v1/demo"}
GENERIC_AUTH_ERROR = {"detail": "Invalid or expired token"}

logger = logging.getLogger("kavacha.auth")


def _safe_log_access(*args, **kwargs) -> None:
    try:
        log_access(*args, **kwargs)
    except Exception:
        logger.exception("audit log write failed")


class SupabaseAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith(PROTECTED_PREFIX):
            return await call_next(request)

        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        action = f"{request.method} {request.url.path}"
        is_sdk_route = request.url.path.startswith(SDK_PREFIX)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            _safe_log_access("anonymous", action, outcome="denied_missing_token")
            return JSONResponse(GENERIC_AUTH_ERROR, status_code=401)

        token = auth_header.removeprefix("Bearer ").strip()
        is_api_key_shaped = token.startswith("kv_")

        # Least privilege (Rule 4): an SDK route and a dashboard route are
        # different audiences. An API key (third-party server code) must
        # never reach dashboard routes (project listing, CEO review, etc.),
        # and a dashboard JWT must never be usable against SDK routes either
        # -- each credential type is confined to the surface it was issued for.
        if is_sdk_route != is_api_key_shaped:
            _safe_log_access("anonymous", action, outcome="denied_wrong_auth_type")
            return JSONResponse(GENERIC_AUTH_ERROR, status_code=401)

        if is_api_key_shaped:
            project_id = verify_api_key(token)
            if project_id is None:
                _safe_log_access("anonymous", action, outcome="denied_invalid_api_key")
                return JSONResponse(GENERIC_AUTH_ERROR, status_code=401)
            request.state.api_key_project_id = project_id
            _safe_log_access(f"api_key:{project_id}", action, outcome="allowed")
            return await call_next(request)

        try:
            payload = verify_supabase_jwt(token)
        except InvalidTokenError as exc:
            logger.info("rejected token on %s: %s", action, exc)
            _safe_log_access("anonymous", action, outcome="denied_invalid_token")
            return JSONResponse(GENERIC_AUTH_ERROR, status_code=401)

        request.state.user = payload
        _safe_log_access(payload.get("sub", "unknown"), action, outcome="allowed")
        return await call_next(request)
