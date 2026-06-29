from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.cors import CORSMiddleware

load_dotenv()

from app.api.v1 import architect, auth, ceo_review, compliance, dashboard, demo, fix_patterns, issues, memory, monitor, projects, sdk, user  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.core.middleware import SupabaseAuthMiddleware  # noqa: E402
from app.core.scheduler import start_monitoring  # noqa: E402
from app.core.security_headers import SecurityHeadersMiddleware  # noqa: E402
from app.db.database import close_pool, get_connection, init_pool  # noqa: E402

IS_DEV = settings.app_env == "development"


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

# No app-level HTTPSRedirectMiddleware: Railway terminates TLS at its edge
# and already enforces HTTPS for the public domain, and Railway's own
# healthcheck hits this container directly over plain HTTP on the private
# network (bypassing that edge) -- the middleware would 307-redirect that
# probe and the deploy would never go healthy.
app.add_middleware(SupabaseAuthMiddleware)

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
# the CDN that Swagger UI's bundled assets load from.
app.add_middleware(SecurityHeadersMiddleware, csp=None if IS_DEV else "default-src 'none'; frame-ancestors 'none'")

app.include_router(auth.router)
app.include_router(demo.router)
app.include_router(dashboard.router)
app.include_router(projects.router)
app.include_router(architect.router)
app.include_router(memory.router)
app.include_router(issues.router)
app.include_router(ceo_review.router)
app.include_router(monitor.router)
app.include_router(compliance.router)
app.include_router(fix_patterns.router)
app.include_router(sdk.router)
app.include_router(user.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "kavacha"}


@app.get("/health")
def health():
    return {"status": "healthy"}
