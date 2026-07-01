import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

load_dotenv()

from app.api.v1 import architect, auth, ceo_review, compliance, dashboard, demo, fix_patterns, honeypot, issues, memory, monitor, projects, requirements, sdk, support, user, waitlist  # noqa: E402
from app.core.account_rate_limit import AccountRateLimitMiddleware  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.core.middleware import SupabaseAuthMiddleware  # noqa: E402
from app.core.request_limits import RequestLimitsMiddleware  # noqa: E402
from app.core.scheduler import start_monitoring, start_trial_checks  # noqa: E402
from app.core.security_headers import SecurityHeadersMiddleware, set_baseline_headers  # noqa: E402
from app.db.database import close_pool, get_connection, init_pool  # noqa: E402

IS_DEV = settings.app_env == "development"
PROD_CSP = "default-src 'none'; frame-ancestors 'none'"

# Without this, every logger.info() call across the codebase (including
# notifier.py's log-only notification provider, and the validation/honeypot
# logging added below) is silently dropped -- Python's root logger has no
# handler by default, and its "lastResort" fallback only surfaces
# WARNING/ERROR/CRITICAL. Confirmed live: log-only notifications never
# appeared in server output before this was added.
logging.basicConfig(level=settings.log_level)

logger = logging.getLogger("kavacha.errors")


def _rearm_monitoring() -> None:
    """APScheduler jobs (app/core/scheduler.py) live in memory only and
    vanish on every redeploy. monitoring_paused is persisted specifically so
    a project the owner explicitly paused stays paused across a restart,
    while everything else resumes -- without this, a redeploy would either
    silently stop monitoring everyone or silently un-pause everyone."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM projects WHERE monitoring_paused = false")
            project_ids = [str(row[0]) for row in cur.fetchall()]
    for project_id in project_ids:
        start_monitoring(project_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    _rearm_monitoring()
    start_trial_checks()
    yield
    close_pool()


app = FastAPI(
    title="Kavacha",
    description="Autonomous AI maintenance infrastructure",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if IS_DEV else None,
    redoc_url="/redoc" if IS_DEV else None,
    openapi_url="/openapi.json" if IS_DEV else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Second, account-keyed rate-limit dimension (Wave 2) on top of slowapi's
# IP-based one above -- added here, before SupabaseAuthMiddleware's own
# add_middleware call below, so it executes AFTER auth in the request flow
# (Starlette: last-added = outermost) and can read request.state.user /
# request.state.api_key_project_id, which SupabaseAuthMiddleware sets.
app.add_middleware(AccountRateLimitMiddleware)

# No app-level HTTPSRedirectMiddleware: Railway terminates TLS at its edge
# and already enforces HTTPS for the public domain, and Railway's own
# healthcheck hits this container directly over plain HTTP on the private
# network (bypassing that edge) -- the middleware would 307-redirect that
# probe and the deploy would never go healthy.
app.add_middleware(SupabaseAuthMiddleware)

# Rejects oversized/malformed requests (bad Content-Type, body/header/URL too
# large) before they cost a JWT verification or an audit_log write -- added
# right after auth so it wraps SupabaseAuthMiddleware (runs first on the way
# in), but stays inside CORS so a rejected cross-origin request still gets
# proper CORS headers on the 413/415 rather than an opaque browser error.
app.add_middleware(RequestLimitsMiddleware)

# CORS next-to-outermost so preflight (OPTIONS) is answered before the
# request ever reaches auth -- browsers send preflight without credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Outermost of all: added last so it wraps every response on the way out,
# including early 401/429 rejections from the auth middleware below -- a
# rejected request needs these headers as much as a successful one does.
# This API is JSON-only in production -- docs/redoc (the only HTML this
# process ever serves) are dev-only, so the CSP can be maximally strict
# with nothing of its own to break. In dev, skip it rather than special-case
# the CDN that Swagger UI's bundled assets load from. HSTS is also prod-only:
# dev has no HTTPS to enforce in the first place.
app.add_middleware(SecurityHeadersMiddleware, csp=None if IS_DEV else PROD_CSP, hsts=not IS_DEV)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.info("validation error on %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse({"detail": "Invalid request"}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Starlette's ServerErrorMiddleware is the true outermost layer -- outside
    # every app.add_middleware() registration above, including
    # SecurityHeadersMiddleware -- so this handler's response never passes
    # back through dispatch() and must set those headers itself.
    logger.exception("unhandled exception on %s %s", request.method, request.url.path)
    response = JSONResponse({"detail": "Internal server error"}, status_code=500)
    set_baseline_headers(response, csp=None if IS_DEV else PROD_CSP, hsts=not IS_DEV)
    return response


app.include_router(auth.router)
app.include_router(demo.router)
app.include_router(honeypot.router)
app.include_router(dashboard.router)
app.include_router(projects.router)
app.include_router(requirements.router)
app.include_router(architect.router)
app.include_router(memory.router)
app.include_router(issues.router)
app.include_router(ceo_review.router)
app.include_router(monitor.router)
app.include_router(compliance.router)
app.include_router(fix_patterns.router)
app.include_router(sdk.router)
app.include_router(user.router)
app.include_router(waitlist.router)
app.include_router(support.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "kavacha"}


@app.get("/health")
def health():
    return {"status": "healthy"}
