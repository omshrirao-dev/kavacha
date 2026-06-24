import logging

from apscheduler.events import EVENT_JOB_ERROR
from apscheduler.schedulers.background import BackgroundScheduler

from app.db.database import get_connection
from app.services.monitor_agent import run_track_a, run_track_b, run_track_c

logger = logging.getLogger("kavacha.scheduler")

_scheduler = BackgroundScheduler()
_started = False


def _job_id(project_id: str, track: str) -> str:
    return f"{track}_{project_id}"


def _log_crash(project_id: str, track: str, exc: Exception) -> None:
    # APScheduler's own thread survives a job exception on its own -- this
    # listener just makes the crash visible where Rule 3 (audit everything)
    # says it belongs: the issues table, not just a swallowed log line.
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO issues (project_id, type, severity, description, fix_applied, verified)
                    VALUES (%s::uuid, 'monitor_crash', 'CRITICAL', %s, false, false)
                    """,
                    (project_id, f"{track} crashed: {type(exc).__name__}: {exc}"),
                )
    except Exception:
        logger.exception("failed to log monitor crash for project %s", project_id)


def _job_error_listener(event):
    job_id = event.job_id
    parts = job_id.split("_", 2)
    if len(parts) == 3:
        _, track_letter, project_id = parts
        _log_crash(project_id, f"track_{track_letter}", event.exception)
    logger.error("monitor job %s crashed: %s", job_id, event.exception)


def _ensure_started() -> None:
    global _started
    if not _started:
        _scheduler.add_listener(_job_error_listener, EVENT_JOB_ERROR)
        _scheduler.start()
        _started = True


def start_monitoring(
    project_id: str,
    track_a_minutes: int = 15,
    track_b_hours: int = 1,
    track_c_hours: int = 24,
) -> None:
    _ensure_started()
    _scheduler.add_job(
        run_track_a, "interval", minutes=track_a_minutes, args=[project_id],
        id=_job_id(project_id, "track_a"), replace_existing=True,
    )
    _scheduler.add_job(
        run_track_b, "interval", hours=track_b_hours, args=[project_id],
        id=_job_id(project_id, "track_b"), replace_existing=True,
    )
    _scheduler.add_job(
        run_track_c, "interval", hours=track_c_hours, args=[project_id],
        id=_job_id(project_id, "track_c"), replace_existing=True,
    )


def stop_monitoring(project_id: str) -> bool:
    found = False
    for track in ("track_a", "track_b", "track_c"):
        job = _scheduler.get_job(_job_id(project_id, track))
        if job:
            job.remove()
            found = True
    return found


def get_monitor_status(project_id: str) -> dict:
    jobs = {}
    for track in ("track_a", "track_b", "track_c"):
        job = _scheduler.get_job(_job_id(project_id, track))
        jobs[track] = {
            "running": job is not None,
            "next_run": job.next_run_time.isoformat() if job and job.next_run_time else None,
        }
    return jobs
