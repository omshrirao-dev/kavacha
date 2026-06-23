import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.audit import log_access
from app.core.security import InvalidTokenError, verify_supabase_jwt

PROTECTED_PREFIX = "/api/v1"
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

        action = f"{request.method} {request.url.path}"

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            _safe_log_access("anonymous", action, outcome="denied_missing_token")
            return JSONResponse(GENERIC_AUTH_ERROR, status_code=401)

        token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = verify_supabase_jwt(token)
        except InvalidTokenError as exc:
            logger.info("rejected token on %s: %s", action, exc)
            _safe_log_access("anonymous", action, outcome="denied_invalid_token")
            return JSONResponse(GENERIC_AUTH_ERROR, status_code=401)

        request.state.user = payload
        _safe_log_access(payload.get("sub", "unknown"), action, outcome="allowed")
        return await call_next(request)
