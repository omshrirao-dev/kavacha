from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

load_dotenv()

from app.api.v1 import architect, ceo_review, compliance, fix_patterns, issues, memory, monitor, projects  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.core.middleware import SupabaseAuthMiddleware  # noqa: E402
from app.db.database import close_pool, init_pool  # noqa: E402

IS_DEV = settings.app_env == "development"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
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

if not IS_DEV:
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(SupabaseAuthMiddleware)

# Added last (outermost) so CORS preflight (OPTIONS) is answered before the
# request ever reaches auth -- browsers send preflight without credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(projects.router)
app.include_router(architect.router)
app.include_router(memory.router)
app.include_router(issues.router)
app.include_router(ceo_review.router)
app.include_router(monitor.router)
app.include_router(compliance.router)
app.include_router(fix_patterns.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "kavacha"}


@app.get("/health")
def health():
    return {"status": "healthy"}
