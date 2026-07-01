from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, field_validator

from app.core.limiter import limiter
from app.core.ownership import verify_project_owner
from app.core.validation import is_uuid_shaped
from app.services.ceo_review_agent import RequirementIssue, run_ceo_review

router = APIRouter(prefix="/api/v1/ceo_review", tags=["ceo_review"])


class CEOReviewRunRequest(BaseModel):
    project_id: str

    @field_validator("project_id")
    @classmethod
    def _project_id_shape(cls, v: str) -> str:
        if not is_uuid_shaped(v):
            raise ValueError("project_id must be a valid UUID")
        return v


class CEOReviewRunResponse(BaseModel):
    project_id: str
    approved: bool
    summary: str
    issues: list[RequirementIssue]
    memory_entry_id: str
    audit_log_id: str


@router.post("/run", response_model=CEOReviewRunResponse)
@limiter.limit("10/hour")
def run_review(request: Request, response: Response, body: CEOReviewRunRequest):
    owner_id = request.state.user["sub"]
    verify_project_owner(body.project_id, owner_id)
    return run_ceo_review(project_id=body.project_id, owner_id=owner_id)
