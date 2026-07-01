from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, field_validator

from app.core.audit import log_access
from app.core.limiter import limiter
from app.core.ownership import verify_project_owner
from app.core.validation import is_uuid_shaped
from app.services.compliance_report import generate_compliance_report

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])


class ComplianceReportRequest(BaseModel):
    project_id: str

    @field_validator("project_id")
    @classmethod
    def _project_id_shape(cls, v: str) -> str:
        if not is_uuid_shaped(v):
            raise ValueError("project_id must be a valid UUID")
        return v


@router.post("/report")
@limiter.limit("10/hour")
def report(request: Request, response: Response, body: ComplianceReportRequest):
    owner_id = request.state.user["sub"]
    verify_project_owner(body.project_id, owner_id)
    result = generate_compliance_report(body.project_id, owner_id)
    log_access(actor_id=owner_id, action="compliance_report_generated", outcome="success", resource=body.project_id)
    return result
