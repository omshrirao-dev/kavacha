from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

MAX_BODY_BYTES = 1 * 1024 * 1024  # 1 MB
MAX_HEADER_BYTES = 8 * 1024  # 8 KB, summed across raw header name+value bytes
MAX_URL_CHARS = 2048
ENFORCED_METHODS = {"POST", "PUT", "PATCH"}

TOO_LARGE = {"detail": "Request too large"}
UNSUPPORTED_MEDIA_TYPE = {"detail": "Unsupported content type"}


class RequestLimitsMiddleware(BaseHTTPMiddleware):
    """Rejects oversized/malformed requests before they reach auth or a
    route handler.

    Body size is checked via `request.body()`, not manual `request.stream()`
    iteration -- Starlette's BaseHTTPMiddleware replays the body to the route
    handler via a `_CachedRequest` that only caches what `body()` collected.
    If middleware instead drains `stream()` directly, `_CachedRequest`
    replays an EMPTY body downstream (see its docstring: "if they call
    Request.stream() then all we do is send an empty body so that downstream
    things don't hang forever") -- every POST/PUT/PATCH in the app would
    silently receive no body. Confirmed against this repo's installed
    Starlette (venv/Lib/site-packages/starlette/middleware/base.py). This
    does mean a request is fully buffered before the size check runs; that's
    the correct tradeoff here over silently breaking every write endpoint.
    """

    async def dispatch(self, request: Request, call_next):
        if len(str(request.url)) > MAX_URL_CHARS:
            return JSONResponse(TOO_LARGE, status_code=413)

        header_bytes = sum(len(k) + len(v) for k, v in request.headers.raw)
        if header_bytes > MAX_HEADER_BYTES:
            return JSONResponse(TOO_LARGE, status_code=413)

        if request.method in ENFORCED_METHODS:
            # Several existing endpoints (regenerate-key, dismiss-issue,
            # apply-fix, monitor start/stop) are bodyless POSTs that send no
            # Content-Type at all -- only enforce the JSON content type once
            # a body actually shows up, not for every POST/PUT/PATCH verb.
            body = await request.body()
            if body:
                content_type = request.headers.get("content-type", "")
                if content_type.split(";")[0].strip().lower() != "application/json":
                    return JSONResponse(UNSUPPORTED_MEDIA_TYPE, status_code=415)

            if len(body) > MAX_BODY_BYTES:
                return JSONResponse(TOO_LARGE, status_code=413)

        return await call_next(request)
