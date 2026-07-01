from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Standard browser-enforced hardening headers. This API serves JSON only
    -- it never renders HTML in production (docs/redoc are dev-only, see
    app/main.py) -- so the CSP can be maximally strict with nothing to break.
    """

    def __init__(self, app, csp: str | None, hsts: bool = False):
        super().__init__(app)
        self._csp = csp
        self._hsts = hsts

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        set_baseline_headers(response, csp=self._csp, hsts=self._hsts)
        return response


def set_baseline_headers(response, csp: str | None, hsts: bool) -> None:
    """Shared with app/main.py's unhandled-exception handler -- Starlette's
    ServerErrorMiddleware sits outside every app.add_middleware() layer
    (including this one), so a 500 response never passes back through
    dispatch() above and needs these set directly. One place to update the
    header list instead of two."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()"
    )
    if hsts:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    if csp:
        response.headers["Content-Security-Policy"] = csp
