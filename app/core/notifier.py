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


def send_notification(owner_id: str, subject: str, message: str) -> None:
    if settings.notification_provider == "sendgrid":
        _send_via_sendgrid(owner_id, subject, message)
    else:
        _send_via_log(owner_id, subject, message)


def _send_via_log(owner_id: str, subject: str, message: str) -> None:
    logger.info("NOTIFICATION (owner=%s) %s\n%s", owner_id, subject, message)


def _resolve_owner_email(owner_id: str) -> str | None:
    # Reads from the user_emails VIEW, not auth.users directly -- kavacha_app
    # has no grant on auth.users itself (Rule 4 least privilege).
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT email FROM user_emails WHERE id = %s::uuid", (owner_id,))
            row = cur.fetchone()
    return row[0] if row else None


def _send_via_sendgrid(owner_id: str, subject: str, message: str) -> None:
    if not settings.sendgrid_api_key:
        raise RuntimeError("NOTIFICATION_PROVIDER=sendgrid but SENDGRID_API_KEY is not set")

    email = _resolve_owner_email(owner_id)
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
