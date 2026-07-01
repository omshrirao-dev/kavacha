import hashlib
import logging

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from app.core.notifier import send_admin_alert
from app.db.database import get_connection

# Fake paths a real Kavacha client never hits -- a request here is a
# near-certain scanner/bot. Registered as TOP-LEVEL paths (not under
# /api/v1) deliberately: SupabaseAuthMiddleware would otherwise 401 an
# unauthenticated scanner before the hit is ever logged, defeating the point.
router = APIRouter(tags=["honeypot"])

logger = logging.getLogger("kavacha.honeypot")

FAKE_PATHS = ["/admin/login", "/wp-admin", "/phpMyAdmin", "/api/v0/users", "/config.php"]

GENERIC_404 = {"detail": "Not found"}


def _hash_user_agent(user_agent: str) -> str | None:
    if not user_agent:
        return None
    return hashlib.sha256(user_agent.encode()).hexdigest()


def _record_hit(request: Request) -> bool:
    """Logs the hit unconditionally; returns True only if this IP hasn't hit
    a honeypot in the last hour, so a scanner hammering all 5 fake paths
    doesn't generate hundreds of admin emails -- one alert per IP per hour."""
    ip = request.client.host if request.client else None
    ua_hash = _hash_user_agent(request.headers.get("user-agent", ""))
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM honeypot_hits WHERE ip = %s AND created_at > now() - interval '1 hour'",
                (ip,),
            )
            recent_count = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO honeypot_hits (path, method, ip, user_agent_hash) VALUES (%s, %s, %s, %s)",
                (request.url.path, request.method, ip, ua_hash),
            )
    return recent_count == 0


async def _honeypot_response(request: Request) -> JSONResponse:
    try:
        should_alert = _record_hit(request)
    except Exception:
        logger.exception("honeypot logging failed for %s", request.url.path)
        should_alert = False

    if should_alert:
        try:
            send_admin_alert(
                subject="Kavacha: honeypot hit",
                message=f"{request.method} {request.url.path} from an IP with no honeypot hits in the last hour.",
            )
        except Exception:
            logger.exception("honeypot admin alert failed")

    return JSONResponse(GENERIC_404, status_code=404)


for _path in FAKE_PATHS:
    router.add_api_route(_path, _honeypot_response, methods=["GET", "POST"])
