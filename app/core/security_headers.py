from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Standard browser-enforced hardening headers. This API serves JSON only
    -- it never renders HTML in production (docs/redoc are dev-only, see
    app/main.py) -- so the CSP can be maximally strict with nothing to break.
    """

    def __init__(self, app, csp: str | None):
        super().__init__(app)
        self._csp = csp

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if self._csp:
            response.headers["Content-Security-Policy"] = self._csp
        return response
