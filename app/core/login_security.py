from app.db.database import get_connection

MAX_ATTEMPTS = 5
WINDOW_MINUTES = 15
LOCKOUT_MINUTES = 30


def is_locked(email: str) -> bool:
    # The now() comparison happens in SQL, not Python -- avoids any clock
    # skew between this process and the DB host mattering at all.
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM login_attempts WHERE email = %s AND locked_until > now()",
                (email,),
            )
            return cur.fetchone() is not None


def record_failed_attempt(email: str) -> bool:
    """Atomic upsert: increments the count (or resets it if the last attempt
    was outside the rolling window), locks the account once the threshold is
    crossed within the window. Single statement, no read-then-write race
    between concurrent login attempts for the same email."""
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
                              END) >= {MAX_ATTEMPTS}
                        THEN now() + interval '{LOCKOUT_MINUTES} minutes'
                        ELSE NULL
                    END
                RETURNING locked_until
                """,
                {"email": email},
            )
            locked_until = cur.fetchone()[0]
    return locked_until is not None


def reset_attempts(email: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM login_attempts WHERE email = %s", (email,))
