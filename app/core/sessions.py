import hashlib

from app.db.database import get_connection

MAX_CONCURRENT_SESSIONS = 5


def _fingerprint(ip: str | None, user_agent: str) -> str:
    return hashlib.sha256(f"{ip or ''}|{user_agent}".encode()).hexdigest()


def record_login(user_id: str, ip: str | None, user_agent: str) -> bool:
    """Records a session row for a successful login and prunes anything
    beyond MAX_CONCURRENT_SESSIONS active sessions (oldest first). Returns
    True if this device fingerprint has never been seen for this user
    before -- the signal the caller uses to decide whether to send a
    new-device login alert.

    Pruning here is bookkeeping/visibility only: it marks old rows revoked
    in our own table, but does not invalidate the Supabase JWT that device
    was already issued (we never store raw tokens -- Rule 1). Real,
    immediate revocation is a separate action (see revoke_all below).
    """
    fingerprint = _fingerprint(ip, user_agent)
    ua_hash = hashlib.sha256(user_agent.encode()).hexdigest() if user_agent else None

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM user_sessions WHERE user_id = %s::uuid AND device_fingerprint = %s",
                (user_id, fingerprint),
            )
            is_new_device = cur.fetchone()[0] == 0

            cur.execute(
                """
                INSERT INTO user_sessions (user_id, device_fingerprint, ip, user_agent_hash)
                VALUES (%s::uuid, %s, %s, %s)
                """,
                (user_id, fingerprint, ip, ua_hash),
            )

            cur.execute(
                """
                UPDATE user_sessions SET revoked = true
                WHERE user_id = %s::uuid AND revoked = false AND id NOT IN (
                    SELECT id FROM user_sessions
                    WHERE user_id = %s::uuid AND revoked = false
                    ORDER BY last_seen_at DESC
                    LIMIT %s
                )
                """,
                (user_id, user_id, MAX_CONCURRENT_SESSIONS),
            )

    return is_new_device


def list_active_sessions(user_id: str) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, ip, created_at, last_seen_at FROM user_sessions
                WHERE user_id = %s::uuid AND revoked = false
                ORDER BY last_seen_at DESC
                """,
                (user_id,),
            )
            columns = [col.name for col in cur.description]
            rows = cur.fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]


def revoke_all(user_id: str) -> None:
    """DB-side bookkeeping only -- pair with a real Supabase
    auth.admin.sign_out(jwt, scope="global") call using the caller's own
    current JWT for actual enforcement (see app/api/v1/user.py)."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE user_sessions SET revoked = true WHERE user_id = %s::uuid", (user_id,))
