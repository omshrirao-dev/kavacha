import hashlib
import secrets

from app.db.database import get_connection

KEY_PREFIX = "kv_"


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def generate_api_key(project_id: str) -> str:
    """Creates a new key, stores only its hash, and returns the raw key.
    This is the ONLY time the raw key is ever available -- it cannot be
    retrieved again, same as how Stripe/GitHub show a secret exactly once."""
    raw_key = KEY_PREFIX + secrets.token_urlsafe(32)
    visible_prefix = raw_key[: len(KEY_PREFIX) + 6]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO api_keys (project_id, key_hash, key_prefix) VALUES (%s::uuid, %s, %s)",
                (project_id, _hash_key(raw_key), visible_prefix),
            )
    return raw_key


def verify_api_key(raw_key: str) -> str | None:
    """Returns the project_id if the key is valid and not revoked, else None.
    Updates last_used_at on every successful verification."""
    if not raw_key.startswith(KEY_PREFIX):
        return None

    key_hash = _hash_key(raw_key)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT project_id FROM api_keys WHERE key_hash = %s AND revoked = false",
                (key_hash,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            cur.execute("UPDATE api_keys SET last_used_at = now() WHERE key_hash = %s", (key_hash,))
    return str(row[0])
