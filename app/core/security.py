from functools import lru_cache

import jwt

from app.core.config import settings


class InvalidTokenError(Exception):
    pass


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")


def verify_supabase_jwt(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    try:
        if header.get("alg") == "HS256":
            # Legacy shared-secret tokens -- covers self-signed test/dev tokens.
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )

        # Real Supabase-issued sessions use asymmetric signing keys (ES256) by
        # default -- verify against the project's public JWKS, not a secret.
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
