from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, field_validator

from app.core.limiter import limiter
from app.services.architect_agent import ArchitectSpec, run_architect_agent

router = APIRouter(prefix="/api/v1/architect", tags=["architect"])

# idea currently has zero bounds and flows straight into an LLM call --
# unbounded text here is a direct cost/DoS vector, the clearest gap of any
# request body in this hardening pass. project_name matches projects.py's
# existing _NAME_MAX_LEN.
_IDEA_MAX_LEN = 5000
_PROJECT_NAME_MAX_LEN = 200


class ArchitectRunRequest(BaseModel):
    idea: str
    project_name: str

    @field_validator("idea")
    @classmethod
    def _idea_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _IDEA_MAX_LEN):
            raise ValueError(f"idea must be between 1 and {_IDEA_MAX_LEN} characters")
        return v

    @field_validator("project_name")
    @classmethod
    def _project_name_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _PROJECT_NAME_MAX_LEN):
            raise ValueError(f"project_name must be between 1 and {_PROJECT_NAME_MAX_LEN} characters")
        return v


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
