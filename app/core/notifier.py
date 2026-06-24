import logging

from app.core.config import settings

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


def _send_via_sendgrid(owner_id: str, subject: str, message: str) -> None:
    if not settings.sendgrid_api_key:
        raise RuntimeError("NOTIFICATION_PROVIDER=sendgrid but SENDGRID_API_KEY is not set")
    raise NotImplementedError(
        "SendGrid wiring needs a least-privilege way to resolve owner_id -> email "
        "(kavacha_app currently has no grant on the auth schema, by design) -- "
        "set this up deliberately when real SendGrid credentials exist."
    )
