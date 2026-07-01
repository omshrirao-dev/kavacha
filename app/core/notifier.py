import logging

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from app.core.config import settings
from app.db.database import get_connection

logger = logging.getLogger("kavacha.notifications")


def format_issue_notification(
    detected_at: str,
    plain_english_summary: str,
    root_cause: str,
    fix_description: str,
    verified: bool,
) -> str:
    return (
        f"Your AI product had an issue at {detected_at}.\n"
        f"{plain_english_summary}\n"
        f"Root cause: {root_cause}\n"
        f"Fix applied: {fix_description}\n"
        f"Verification: {'passed' if verified else 'failed'}\n"
        "Your users never noticed."
    )


# Rule 7 / Fix Engine approval gate: CRITICAL issues are diagnosed but held
# pending until a human clicks Apply Fix, so the notification must say that
# explicitly rather than claiming "fixed" before anything was actually applied.
def format_pending_fix_notification(
    detected_at: str,
    plain_english_summary: str,
    root_cause: str,
    fix_description: str,
) -> str:
    return (
        f"Your AI product had a CRITICAL issue at {detected_at}.\n"
        f"{plain_english_summary}\n"
        f"Root cause: {root_cause}\n"
        f"Proposed fix: {fix_description}\n"
        "This needs your approval before Kavacha applies it -- review and apply it from the Issues tab."
    )


# Wave 4: sent once per account, on day 12 of the trial (see
# app/core/accounts.py's WARNING_DAY and the daily scheduler job).
def format_trial_warning_notification(days_left: int) -> str:
    return (
        f"Your Kavacha trial ends in {days_left} days.\n"
        "After that, you'll move to the free tier (1 project, 500 events/month) unless you're on the early-access "
        "waitlist for paid plans -- click \"Upgrade\" anywhere in the dashboard to join it.\n"
        "Already given us feedback? It automatically extends your trial by 15 days -- look for the survey on your "
        "dashboard if you haven't seen it yet."
    )


# Security Wave 2: sent only when app/core/sessions.record_login() reports a
# device fingerprint never seen before for this user -- not on every login.
def format_new_login_notification(ip: str, when: str) -> str:
    return (
        f"New login to your Kavacha account from IP {ip} at {when}.\n"
        "Not you? Go to Account Settings and use \"Log out of all devices\" immediately, "
        "then change your password."
    )


def should_notify(project_id: str) -> bool:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT alerts_enabled FROM projects WHERE id = %s::uuid", (project_id,))
            row = cur.fetchone()
    # A project lookup that finds nothing is not this function's problem to
    # diagnose -- default to notifying rather than silently swallowing an alert.
    return row is None or bool(row[0])


def resolve_notification_email(project_id: str, owner_id: str) -> str | None:
    """A project-level override (Settings tab) takes priority; falls back to
    the account owner's Supabase email, same as the only behavior that existed
    before this override was added."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT notification_email FROM projects WHERE id = %s::uuid", (project_id,))
            row = cur.fetchone()
    override = row[0] if row else None
    return override or resolve_owner_email(owner_id)


def send_notification(owner_id: str, subject: str, message: str, email_override: str | None = None) -> None:
    if settings.notification_provider == "sendgrid":
        _send_via_sendgrid(owner_id, subject, message, email_override)
    else:
        _send_via_log(owner_id, subject, message)


def _send_via_log(owner_id: str, subject: str, message: str) -> None:
    logger.info("NOTIFICATION (owner=%s) %s\n%s", owner_id, subject, message)


def resolve_owner_email(owner_id: str) -> str | None:
    # Reads from the user_emails VIEW, not auth.users directly -- kavacha_app
    # has no grant on auth.users itself (Rule 4 least privilege).
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT email FROM user_emails WHERE id = %s::uuid", (owner_id,))
            row = cur.fetchone()
    return row[0] if row else None


def send_admin_alert(subject: str, message: str) -> None:
    """For alerts with no project/owner context at all (e.g. a honeypot hit)
    -- deliberately not a variant of send_notification, whose whole signature
    (resolve_notification_email, resolve_owner_email) assumes an owner_id to
    resolve. Same guarantee as the rest of this file: never raises, always
    falls back to a log line rather than the alert silently vanishing."""
    if not settings.admin_alert_email:
        logger.info("ADMIN ALERT (no admin_alert_email configured): %s\n%s", subject, message)
        return

    if settings.notification_provider == "sendgrid" and settings.sendgrid_api_key:
        mail = Mail(
            from_email=settings.notification_from_email,
            to_emails=settings.admin_alert_email,
            subject=subject,
            plain_text_content=message,
        )
        try:
            client = SendGridAPIClient(settings.sendgrid_api_key)
            response = client.send(mail)
            logger.info("admin alert sent to %s, status=%s", settings.admin_alert_email, response.status_code)
            return
        except Exception:
            logger.exception("sendgrid admin alert failed -- falling back to log")

    logger.info("ADMIN ALERT (admin=%s): %s\n%s", settings.admin_alert_email, subject, message)


def _send_via_sendgrid(owner_id: str, subject: str, message: str, email_override: str | None = None) -> None:
    if not settings.sendgrid_api_key:
        raise RuntimeError("NOTIFICATION_PROVIDER=sendgrid but SENDGRID_API_KEY is not set")

    email = email_override or resolve_owner_email(owner_id)
    if not email:
        logger.warning("no email found for owner %s -- falling back to log provider", owner_id)
        _send_via_log(owner_id, subject, message)
        return

    mail = Mail(
        from_email=settings.notification_from_email,
        to_emails=email,
        subject=subject,
        plain_text_content=message,
    )
    try:
        client = SendGridAPIClient(settings.sendgrid_api_key)
        response = client.send(mail)
        logger.info("sendgrid notification sent to %s, status=%s", email, response.status_code)
    except Exception:
        # A failed send must never mean the notification just vanishes --
        # same "nothing breaks silently" principle as everywhere else here.
        logger.exception("sendgrid send failed for owner %s -- falling back to log provider", owner_id)
        _send_via_log(owner_id, subject, message)
