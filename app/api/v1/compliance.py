from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from app.core.audit import log_access
from app.core.limiter import limiter
from app.core.ownership import verify_project_owner
from app.services.compliance_report import generate_compliance_report

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])


class ComplianceReportRequest(BaseModel):
    project_id: str


@router.post("/report")
@limiter.limit("10/hour")
def report(request: Request, response: Response, body: ComplianceReportRequest):
    owner_id = request.state.user["sub"]
    verify_project_owner(body.project_id, owner_id)
    result = generate_compliance_report(body.project_id, owner_id)
    log_access(actor_id=owner_id, action="compliance_report_generated", outcome="success", resource=body.project_id)
    return result
