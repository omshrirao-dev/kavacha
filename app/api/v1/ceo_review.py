from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from app.core.limiter import limiter
from app.core.ownership import verify_project_owner
from app.services.ceo_review_agent import RequirementIssue, run_ceo_review

router = APIRouter(prefix="/api/v1/ceo_review", tags=["ceo_review"])


class CEOReviewRunRequest(BaseModel):
    project_id: str


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
