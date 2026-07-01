from datetime import datetime, timezone

from app.db.database import get_connection

# Tiered lockout (Wave 2) -- escalates with repeated failures instead of a
# single threshold, so a handful of typos costs a client almost nothing while
# a sustained attack gets progressively more expensive to continue.
WINDOW_MINUTES = 15  # attempt_count resets if the last attempt is older than this
TIER_1_ATTEMPTS = 3
TIER_1_LOCKOUT_SECONDS = 30
TIER_2_ATTEMPTS = 5
TIER_2_LOCKOUT_MINUTES = 15
TIER_3_ATTEMPTS = 10
TIER_3_LOCKOUT_HOURS = 24

# CAPTCHA is required starting at the same threshold Tier 1 kicks in --
# see app/core/captcha.py. A no-op until HCAPTCHA_SECRET_KEY is configured.
CAPTCHA_REQUIRED_AFTER_ATTEMPTS = TIER_1_ATTEMPTS


def is_locked(email: str) -> datetime | None:
    """Returns the lockout expiry (for a Retry-After header) or None if not
    locked. The now() comparison happens in SQL, not Python -- avoids any
    clock skew between this process and the DB host mattering at all."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT locked_until FROM login_attempts WHERE email = %s AND locked_until > now()",
                (email,),
            )
            row = cur.fetchone()
    return row[0] if row else None


def get_attempt_count(email: str) -> int:
    """Current attempt count within the rolling window -- used to decide
    whether a login attempt must include a CAPTCHA token, independent of
    whether the account is actually locked right now."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT attempt_count FROM login_attempts
                WHERE email = %s AND last_attempt > now() - interval '{WINDOW_MINUTES} minutes'
                """,
                (email,),
            )
            row = cur.fetchone()
    return row[0] if row else 0


def record_failed_attempt(email: str) -> datetime | None:
    """Atomic upsert: increments the count (or resets it if the last attempt
    was outside the rolling window), locks the account for an escalating
    duration once each tier's threshold is crossed within the window. Single
    statement, no read-then-write race between concurrent login attempts for
    the same email. Returns the new locked_until (None if still unlocked)."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO login_attempts (email, attempt_count, last_attempt, locked_until)
                VALUES (%(email)s, 1, now(), NULL)
                ON CONFLICT (email) DO UPDATE SET
                    attempt_count = CASE
                        WHEN login_attempts.last_attempt < now() - interval '{WINDOW_MINUTES} minutes' THEN 1
                        ELSE login_attempts.attempt_count + 1
                    END,
                    last_attempt = now(),
                    locked_until = CASE
                        WHEN (CASE
                                WHEN login_attempts.last_attempt < now() - interval '{WINDOW_MINUTES} minutes' THEN 1
                                ELSE login_attempts.attempt_count + 1
                              END) >= {TIER_3_ATTEMPTS}
                        THEN now() + interval '{TIER_3_LOCKOUT_HOURS} hours'
                        WHEN (CASE
                                WHEN login_attempts.last_attempt < now() - interval '{WINDOW_MINUTES} minutes' THEN 1
                                ELSE login_attempts.attempt_count + 1
                              END) >= {TIER_2_ATTEMPTS}
                        THEN now() + interval '{TIER_2_LOCKOUT_MINUTES} minutes'
                        WHEN (CASE
                                WHEN login_attempts.last_attempt < now() - interval '{WINDOW_MINUTES} minutes' THEN 1
                                ELSE login_attempts.attempt_count + 1
                              END) >= {TIER_1_ATTEMPTS}
                        THEN now() + interval '{TIER_1_LOCKOUT_SECONDS} seconds'
                        ELSE NULL
                    END
                RETURNING locked_until
                """,
                {"email": email},
            )
            locked_until = cur.fetchone()[0]
    return locked_until


def retry_after_seconds(locked_until: datetime) -> int:
    remaining = (locked_until - datetime.now(timezone.utc)).total_seconds()
    return max(1, int(remaining))


def reset_attempts(email: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM login_attempts WHERE email = %s", (email,))
