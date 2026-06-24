from fastapi import APIRouter, Query, Request, Response
from pydantic import BaseModel

from app.core.audit import log_access
from app.core.limiter import limiter
from app.core.ownership import verify_project_owner
from app.core.scheduler import get_monitor_status, start_monitoring, stop_monitoring
from app.services.monitor_agent import get_cost_intelligence, run_track_a, run_track_b, run_track_c

router = APIRouter(prefix="/api/v1/monitor", tags=["monitor"])


class ProjectIdRequest(BaseModel):
    project_id: str


class ManualTestRequest(BaseModel):
    project_id: str
    track: str = "all"


@router.post("/start")
@limiter.limit("20/hour")
def start(request: Request, response: Response, body: ProjectIdRequest):
    owner_id = request.state.user["sub"]
    verify_project_owner(body.project_id, owner_id)
    start_monitoring(body.project_id)
    log_access(actor_id=owner_id, action="monitor_start", outcome="started", resource=body.project_id)
    return {"project_id": body.project_id, "status": "started", "jobs": get_monitor_status(body.project_id)}


@router.post("/stop")
@limiter.limit("20/hour")
def stop(request: Request, response: Response, body: ProjectIdRequest):
    owner_id = request.state.user["sub"]
    verify_project_owner(body.project_id, owner_id)
    found = stop_monitoring(body.project_id)
    log_access(actor_id=owner_id, action="monitor_stop", outcome="stopped" if found else "not_running", resource=body.project_id)
    return {"project_id": body.project_id, "status": "stopped" if found else "not_running"}


@router.get("/status")
@limiter.limit("60/minute")
def status(request: Request, response: Response, project_id: str = Query(...)):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)
    return {"project_id": project_id, "jobs": get_monitor_status(project_id)}


@router.get("/cost")
@limiter.limit("60/minute")
def cost(request: Request, response: Response, project_id: str = Query(...)):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)
    return {"project_id": project_id, **get_cost_intelligence(project_id)}


@router.post("/test")
@limiter.limit("10/hour")
def manual_test(request: Request, response: Response, body: ManualTestRequest):
    owner_id = request.state.user["sub"]
    verify_project_owner(body.project_id, owner_id)

    results = {}
    if body.track in ("a", "all"):
        results["track_a"] = run_track_a(body.project_id)
    if body.track in ("b", "all"):
        results["track_b"] = run_track_b(body.project_id)
    if body.track in ("c", "all"):
        results["track_c"] = run_track_c(body.project_id)

    log_access(
        actor_id=owner_id,
        action="monitor_manual_test",
        outcome="completed",
        resource=body.project_id,
        metadata={"track": body.track},
    )
    return {"project_id": body.project_id, "results": results}
