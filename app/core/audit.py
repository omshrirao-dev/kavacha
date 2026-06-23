import json

from app.db.database import get_connection


def log_access(actor_id: str, action: str, outcome: str, resource: str | None = None, metadata: dict | None = None) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO audit_log (actor_id, action, resource, outcome, metadata)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (actor_id, action, resource, outcome, json.dumps(metadata) if metadata else None),
            )
