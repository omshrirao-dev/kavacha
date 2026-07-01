import logging
from datetime import datetime, timezone

from apscheduler.events import EVENT_JOB_ERROR
from apscheduler.schedulers.background import BackgroundScheduler

from app.core.accounts import WARNING_DAY, mark_downgraded, mark_warning_sent
from app.core.notifier import format_trial_warning_notification, send_notification
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


# Wave 4: the one job in this file that's global, not per-project -- every
# other job here is scoped to a single project's monitoring. Runs once daily
# rather than being re-armed per account, since trial state isn't tied to
# monitoring_paused/redeploys the way project jobs are -- missing one day's
# 3am run because the server happened to be mid-redeploy just means an
# account's day-12 email or downgrade lands a few hours late, not silently
# forever (the check is >=, not ==, so the next run still catches it).
def _run_trial_checks() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, trial_started_at, trial_ends_at, warning_email_sent_at, downgraded_at FROM accounts")
            columns = [c.name for c in cur.description]
            rows = [dict(zip(columns, row, strict=True)) for row in cur.fetchall()]

    now = datetime.now(timezone.utc)
    for account in rows:
        user_id = str(account["user_id"])
        days_since_start = (now - account["trial_started_at"]).days

        if account["warning_email_sent_at"] is None and account["downgraded_at"] is None and days_since_start >= WARNING_DAY:
            try:
                days_left = max(0, (account["trial_ends_at"] - now).days)
                send_notification(user_id, "Kavacha: your trial ends soon", format_trial_warning_notification(days_left))
            except Exception:
                logger.exception("trial warning email failed for user %s", user_id)
            mark_warning_sent(user_id)

        if account["downgraded_at"] is None and now >= account["trial_ends_at"]:
            mark_downgraded(user_id)


def start_trial_checks() -> None:
    _ensure_started()
    _scheduler.add_job(
        _run_trial_checks, "cron", hour=3, minute=0, id="trial_checks", replace_existing=True,
    )


def get_monitor_status(project_id: str) -> dict:
    jobs = {}
    for track in ("track_a", "track_b", "track_c"):
        job = _scheduler.get_job(_job_id(project_id, track))
        jobs[track] = {
            "running": job is not None,
            "next_run": job.next_run_time.isoformat() if job and job.next_run_time else None,
        }
    return jobs
