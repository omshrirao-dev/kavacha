from datetime import datetime, timezone

from app.db.database import get_connection

TRIAL_DAYS = 15
TRIAL_EXTENSION_DAYS = 15
SURVEY_AVAILABLE_DAY = 10
WARNING_DAY = 12

FREE_TIER_PROJECT_LIMIT = 1
FREE_TIER_EVENTS_PER_MONTH = 500


class ProjectLimitExceeded(Exception):
    pass


class EventLimitExceeded(Exception):
    pass


_ACCOUNT_COLUMNS = "user_id, trial_started_at, trial_ends_at, trial_extended, warning_email_sent_at, downgraded_at"


def _row_to_account(row) -> dict:
    keys = [c.strip() for c in _ACCOUNT_COLUMNS.split(",")]
    return dict(zip(keys, row, strict=True))


def get_or_create_account(user_id: str) -> dict:
    """No signup endpoint of our own exists -- signup goes straight to
    Supabase -- so the trial "starts on signup" by starting the first time
    this account is seen by any endpoint that checks plan status."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {_ACCOUNT_COLUMNS} FROM accounts WHERE user_id = %s::uuid", (user_id,))
            row = cur.fetchone()
            if row is not None:
                return _row_to_account(row)

            cur.execute(
                f"""
                INSERT INTO accounts (user_id, trial_ends_at)
                VALUES (%s::uuid, now() + interval '{TRIAL_DAYS} days')
                ON CONFLICT (user_id) DO NOTHING
                RETURNING {_ACCOUNT_COLUMNS}
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if row is not None:
                return _row_to_account(row)

            # Lost the insert race to a concurrent request -- the other one
            # already created it, just read what it wrote.
            cur.execute(f"SELECT {_ACCOUNT_COLUMNS} FROM accounts WHERE user_id = %s::uuid", (user_id,))
            return _row_to_account(cur.fetchone())


def days_since_trial_start(account: dict) -> int:
    return (datetime.now(timezone.utc) - account["trial_started_at"]).days


def trial_days_left(account: dict) -> int:
    remaining = account["trial_ends_at"] - datetime.now(timezone.utc)
    return max(0, remaining.days + (1 if remaining.seconds > 0 else 0))


def is_on_free_tier(account: dict) -> bool:
    return account["downgraded_at"] is not None


def extend_trial(user_id: str) -> None:
    """Called on feedback-survey submission. Gated on trial_extended so a
    second submission doesn't extend the trial twice.

    Also clears downgraded_at: an account that already lapsed onto the free
    tier before submitting feedback must return to full trial access, not
    just get a later trial_ends_at while still capped at free-tier limits
    (confirmed live during Wave 4 verification -- without this, is_on_free_tier()
    stayed true after an extension since it only checks downgraded_at, not
    trial_ends_at). warning_email_sent_at is deliberately left alone: the
    day-12 warning is a one-time event relative to trial_started_at (which
    never moves), not something that should re-fire the moment days_since_start
    permanently exceeds 12 again after this reset."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE accounts SET
                    trial_ends_at = trial_ends_at + interval '{TRIAL_EXTENSION_DAYS} days',
                    trial_extended = true,
                    downgraded_at = NULL
                WHERE user_id = %s::uuid AND trial_extended = false
                """,
                (user_id,),
            )


def mark_warning_sent(user_id: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE accounts SET warning_email_sent_at = now() WHERE user_id = %s::uuid", (user_id,))


def mark_downgraded(user_id: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE accounts SET downgraded_at = now() WHERE user_id = %s::uuid", (user_id,))


def count_owned_projects(user_id: str) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM projects WHERE owner_id = %s::uuid", (user_id,))
            return cur.fetchone()[0]


def count_events_this_month(user_id: str) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT count(*) FROM sdk_events e
                JOIN projects p ON p.id = e.project_id
                WHERE p.owner_id = %s::uuid AND e.created_at >= date_trunc('month', now())
                """,
                (user_id,),
            )
            return cur.fetchone()[0]


def account_status(user_id: str) -> dict:
    account = get_or_create_account(user_id)
    free_tier = is_on_free_tier(account)
    projects_used = count_owned_projects(user_id)
    events_used = count_events_this_month(user_id)
    return {
        "status": "free" if free_tier else "trial",
        "trial_days_left": trial_days_left(account),
        "trial_extended": account["trial_extended"],
        "survey_available": days_since_trial_start(account) >= SURVEY_AVAILABLE_DAY and not account["trial_extended"],
        "project_limit": FREE_TIER_PROJECT_LIMIT if free_tier else None,
        "projects_used": projects_used,
        "events_limit": FREE_TIER_EVENTS_PER_MONTH if free_tier else None,
        "events_used_this_month": events_used,
    }


def enforce_project_limit(user_id: str) -> None:
    """Raises via the caller's own HTTPException convention -- kept as a
    plain check here (returns True/False) so app/api/v1/projects.py controls
    the exact status code/message, matching this file's other callers."""
    account = get_or_create_account(user_id)
    if not is_on_free_tier(account):
        return
    if count_owned_projects(user_id) >= FREE_TIER_PROJECT_LIMIT:
        raise ProjectLimitExceeded()


def enforce_event_limit(user_id: str) -> None:
    account = get_or_create_account(user_id)
    if not is_on_free_tier(account):
        return
    if count_events_this_month(user_id) >= FREE_TIER_EVENTS_PER_MONTH:
        raise EventLimitExceeded()
