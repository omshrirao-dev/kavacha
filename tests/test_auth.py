import time

import jwt
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def _make_token(exp_offset_seconds: int) -> str:
    now = int(time.time())
    payload = {
        "sub": "00000000-0000-0000-0000-000000000000",
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + exp_offset_seconds,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def test_protected_route_valid_token():
    token = _make_token(3600)
    with TestClient(app) as client:
        response = client.get("/api/v1/projects", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_protected_route_missing_token():
    with TestClient(app) as client:
        response = client.get("/api/v1/projects")
    assert response.status_code == 401


def test_protected_route_invalid_token():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/projects", headers={"Authorization": "Bearer not-a-real-token"}
        )
    assert response.status_code == 401


def test_protected_route_expired_token():
    token = _make_token(-3600)
    with TestClient(app) as client:
        response = client.get("/api/v1/projects", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
