import threading
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

WINDOW_SECONDS = 60
MAX_REQUESTS_PER_ACCOUNT = 200

TOO_MANY_REQUESTS = {"detail": "Too many requests"}


class AccountRateLimitMiddleware(BaseHTTPMiddleware):
    """A second rate-limiting dimension on top of slowapi's IP-based limit
    (app/core/limiter.py): keyed by account (JWT sub, or an SDK api_key's
    project_id) instead of IP, so one account can't spend its whole budget
    from many source IPs, and one shared IP (NAT, office network) doesn't
    throttle every account behind it together. Must run after
    SupabaseAuthMiddleware (see main.py's middleware ordering) so
    request.state.user/api_key_project_id are already populated.

    In-memory, single dict guarded by a plain lock -- consistent with this
    app's existing single-worker-process assumption (see Dockerfile's
    comment on APScheduler) and the fact no Redis is available yet. Doesn't
    survive a restart and won't work across multiple workers/replicas; if
    this app ever moves to multiple processes, this needs a shared store
    (Redis) instead.
    """

    def __init__(self, app):
        super().__init__(app)
        self._lock = threading.Lock()
        self._counters: dict[str, tuple[float, int]] = {}

    def _account_key(self, request: Request) -> str | None:
        user = getattr(request.state, "user", None)
        if user:
            return f"user:{user['sub']}"
        project_id = getattr(request.state, "api_key_project_id", None)
        if project_id:
            return f"project:{project_id}"
        return None

    async def dispatch(self, request: Request, call_next):
        key = self._account_key(request)
        if key is not None:
            now = time.monotonic()
            with self._lock:
                window_start, count = self._counters.get(key, (now, 0))
                if now - window_start >= WINDOW_SECONDS:
                    window_start, count = now, 0
                count += 1
                self._counters[key] = (window_start, count)

            if count > MAX_REQUESTS_PER_ACCOUNT:
                retry_after = max(1, int(WINDOW_SECONDS - (now - window_start)))
                return JSONResponse(TOO_MANY_REQUESTS, status_code=429, headers={"Retry-After": str(retry_after)})

        return await call_next(request)
