from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from app.core.limiter import limiter
from app.services.architect_agent import ArchitectSpec, run_architect_agent

router = APIRouter(prefix="/api/v1/architect", tags=["architect"])


class ArchitectRunRequest(BaseModel):
    idea: str
    project_name: str


class ArchitectRunResponse(BaseModel):
    project_id: str
    spec: ArchitectSpec
    memory_entry_ids: list[str]


@router.post("/run", response_model=ArchitectRunResponse)
@limiter.limit("10/minute")
def run_architect(request: Request, response: Response, body: ArchitectRunRequest):
    # slowapi's per-route decorator injects X-RateLimit-* headers onto this
    # `response` param directly -- it can't attach them to our return value,
    # since FastAPI converts that to the real Response after this returns.
    owner_id = request.state.user["sub"]
    return run_architect_agent(idea=body.idea, project_name=body.project_name, owner_id=owner_id)
