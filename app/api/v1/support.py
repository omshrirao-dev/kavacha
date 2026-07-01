from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, field_validator

from app.core.audit import log_access
from app.core.limiter import limiter
from app.core.notifier import send_admin_alert

router = APIRouter(prefix="/api/v1/support", tags=["support"])

_SUBJECT_MAX_LEN = 200
_DESCRIPTION_MAX_LEN = 2000
_PROJECT_DETAILS_MAX_LEN = 2000


class BugReportRequest(BaseModel):
    subject: str
    description: str

    @field_validator("subject")
    @classmethod
    def _subject_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _SUBJECT_MAX_LEN):
            raise ValueError(f"subject must be between 1 and {_SUBJECT_MAX_LEN} characters")
        return v

    @field_validator("description")
    @classmethod
    def _description_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _DESCRIPTION_MAX_LEN):
            raise ValueError(f"description must be between 1 and {_DESCRIPTION_MAX_LEN} characters")
        return v


class ProjectAdditionRequest(BaseModel):
    details: str

    @field_validator("details")
    @classmethod
    def _details_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _PROJECT_DETAILS_MAX_LEN):
            raise ValueError(f"details must be between 1 and {_PROJECT_DETAILS_MAX_LEN} characters")
        return v


@router.post("/bug-report")
@limiter.limit("10/hour")
def submit_bug_report(request: Request, response: Response, body: BugReportRequest):
    owner_id = request.state.user["sub"]
    reporter_email = request.state.user.get("email") or "unknown"
    send_admin_alert(
        subject=f"Kavacha bug report: {body.subject}",
        message=f"From: {reporter_email} (user_id={owner_id})\n\n{body.description}",
    )
    log_access(actor_id=owner_id, action="bug_report_submitted", outcome="success")
    return {"status": "submitted"}


@router.post("/project-addition")
@limiter.limit("10/hour")
def request_project_addition(request: Request, response: Response, body: ProjectAdditionRequest):
    """The manual-add flow: a user who wants the Kavacha team to set up
    their project for them rather than doing it themselves. This just pages
    the admin -- there's no automated project creation on the other end of
    it, by design (Rule 7: no autonomous write path into the developer's own
    infrastructure)."""
    owner_id = request.state.user["sub"]
    reporter_email = request.state.user.get("email") or "unknown"
    send_admin_alert(
        subject="Kavacha: manual project addition requested",
        message=f"From: {reporter_email} (user_id={owner_id})\n\n{body.details}",
    )
    log_access(actor_id=owner_id, action="project_addition_requested", outcome="success")
    return {"status": "submitted"}
