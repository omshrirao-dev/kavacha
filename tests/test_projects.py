import time

import jwt
import psycopg2
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.database import close_pool, init_pool
from app.main import app

OWNER_ID = "00000000-0000-0000-0000-000000000000"
OTHER_OWNER_ID = "11111111-1111-1111-1111-111111111111"


def _make_token(sub: str = OWNER_ID, email: str | None = None, user_metadata: dict | None = None) -> str:
    now = int(time.time())
    payload = {
        "sub": sub,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + 3600,
    }
    if email is not None:
        payload["email"] = email
    if user_metadata is not None:
        payload["user_metadata"] = user_metadata
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _auth(sub: str = OWNER_ID) -> dict:
    return {"Authorization": f"Bearer {_make_token(sub)}"}


def _cleanup_project(project_id: str) -> None:
    conn = psycopg2.connect(settings.database_url)
    with conn.cursor() as cur:
        cur.execute("DELETE FROM projects WHERE id = %s", (project_id,))
    conn.commit()
    conn.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_create_project_returns_api_key_once(client):
    response = client.post(
        "/api/v1/projects",
        headers=_auth(),
        json={
            "name": "test-create-project",
            "description": "A test project",
            "ai_model": "Claude",
            "framework": "Custom Python",
            "monthly_budget": 25.0,
            "deployed_url": "https://example.com",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["api_key"].startswith("kv_")
    project_id = body["project_id"]
    try:
        get_response = client.get(f"/api/v1/projects/{project_id}", headers=_auth())
        assert get_response.status_code == 200
        assert get_response.json()["name"] == "test-create-project"
    finally:
        _cleanup_project(project_id)


def test_create_project_requires_jwt(client):
    response = client.post("/api/v1/projects", json={"name": "no-auth-test"})
    assert response.status_code == 401


def test_create_project_rejects_empty_name(client):
    response = client.post("/api/v1/projects", headers=_auth(), json={"name": ""})
    assert response.status_code == 422


def test_connection_status_starts_disconnected(client):
    create = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-connection-status"})
    project_id = create.json()["project_id"]
    try:
        response = client.get(f"/api/v1/projects/{project_id}/connection-status", headers=_auth())
        assert response.status_code == 200
        assert response.json() == {"connected": False, "last_event": None}
    finally:
        _cleanup_project(project_id)


def test_update_project_edits_fields(client):
    create = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-update-project"})
    project_id = create.json()["project_id"]
    try:
        response = client.put(
            f"/api/v1/projects/{project_id}",
            headers=_auth(),
            json={"name": "renamed-project", "description": "updated description", "monthly_budget": 50.0},
        )
        assert response.status_code == 200, response.text
        assert set(response.json()["updated_fields"]) == {"name", "description", "monthly_budget"}

        conn = psycopg2.connect(settings.database_url)
        with conn.cursor() as cur:
            cur.execute("SELECT name, description, monthly_budget FROM projects WHERE id = %s", (project_id,))
            row = cur.fetchone()
        conn.close()
        assert row == ("renamed-project", "updated description", 50.0)
    finally:
        _cleanup_project(project_id)


def test_update_project_404s_for_non_owner(client):
    create = client.post("/api/v1/projects", headers=_auth(OWNER_ID), json={"name": "test-cross-owner-update"})
    project_id = create.json()["project_id"]
    try:
        response = client.put(f"/api/v1/projects/{project_id}", headers=_auth(OTHER_OWNER_ID), json={"name": "hijacked"})
        assert response.status_code == 404
    finally:
        _cleanup_project(project_id)


def test_pause_project_persists_and_toggles(client):
    create = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-pause-project"})
    project_id = create.json()["project_id"]
    try:
        response = client.put(f"/api/v1/projects/{project_id}/pause", headers=_auth(), json={"paused": True})
        assert response.status_code == 200
        assert response.json()["monitoring_paused"] is True

        conn = psycopg2.connect(settings.database_url)
        with conn.cursor() as cur:
            cur.execute("SELECT monitoring_paused FROM projects WHERE id = %s", (project_id,))
            assert cur.fetchone()[0] is True
        conn.close()

        response = client.put(f"/api/v1/projects/{project_id}/pause", headers=_auth(), json={"paused": False})
        assert response.status_code == 200
        assert response.json()["monitoring_paused"] is False
    finally:
        _cleanup_project(project_id)


def test_regenerate_api_key_revokes_old_key(client):
    create = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-regenerate-key"})
    project_id = create.json()["project_id"]
    old_key_prefix = create.json()["api_key"][:9]
    try:
        response = client.post(f"/api/v1/projects/{project_id}/api-keys/regenerate", headers=_auth())
        assert response.status_code == 200, response.text
        new_key = response.json()["api_key"]
        assert new_key.startswith("kv_")
        assert not new_key.startswith(old_key_prefix)

        conn = psycopg2.connect(settings.database_url)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT key_prefix, revoked FROM api_keys WHERE project_id = %s ORDER BY created_at",
                (project_id,),
            )
            rows = cur.fetchall()
        conn.close()
        assert len(rows) == 2
        assert rows[0][1] is True  # original key now revoked
        assert rows[1][1] is False  # new key still active
    finally:
        _cleanup_project(project_id)


def test_delete_project_removes_it(client):
    create = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-delete-project"})
    project_id = create.json()["project_id"]

    response = client.delete(f"/api/v1/projects/{project_id}", headers=_auth())
    assert response.status_code == 200

    get_response = client.get(f"/api/v1/projects/{project_id}", headers=_auth())
    assert get_response.status_code == 404


def test_delete_project_404s_for_non_owner(client):
    create = client.post("/api/v1/projects", headers=_auth(OWNER_ID), json={"name": "test-cross-owner-delete"})
    project_id = create.json()["project_id"]
    try:
        response = client.delete(f"/api/v1/projects/{project_id}", headers=_auth(OTHER_OWNER_ID))
        assert response.status_code == 404
    finally:
        _cleanup_project(project_id)


def _insert_issue(project_id: str, **overrides) -> str:
    fields = {
        "type": "hallucination",
        "severity": "CRITICAL",
        "description": "test issue",
        "root_cause": "test root cause",
        "fix_applied": False,
        "verified": False,
        "dismissed": False,
        "proposed_fix_description": "test proposed fix",
        **overrides,
    }
    conn = psycopg2.connect(settings.database_url)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO issues (project_id, type, severity, description, root_cause, fix_applied, verified, dismissed, proposed_fix_description)
            VALUES (%(project_id)s, %(type)s, %(severity)s, %(description)s, %(root_cause)s, %(fix_applied)s, %(verified)s, %(dismissed)s, %(proposed_fix_description)s)
            RETURNING id
            """,
            {"project_id": project_id, **fields},
        )
        issue_id = str(cur.fetchone()[0])
    conn.commit()
    conn.close()
    return issue_id


def test_dismiss_issue_marks_dismissed(client):
    create = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-dismiss-issue"})
    project_id = create.json()["project_id"]
    try:
        issue_id = _insert_issue(project_id)
        response = client.post(f"/api/v1/projects/{project_id}/issues/{issue_id}/dismiss", headers=_auth())
        assert response.status_code == 200

        conn = psycopg2.connect(settings.database_url)
        with conn.cursor() as cur:
            cur.execute("SELECT dismissed FROM issues WHERE id = %s", (issue_id,))
            assert cur.fetchone()[0] is True
        conn.close()
    finally:
        _cleanup_project(project_id)


def test_dismiss_issue_404s_for_issue_in_other_project(client):
    """Regression test for the IDOR caught during review: dismissing must be
    scoped by project_id, not just issue_id, or any authenticated owner could
    dismiss any other project's issue by guessing its UUID."""
    create_a = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-idor-project-a"})
    create_b = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-idor-project-b"})
    project_a, project_b = create_a.json()["project_id"], create_b.json()["project_id"]
    try:
        issue_id = _insert_issue(project_a)
        response = client.post(f"/api/v1/projects/{project_b}/issues/{issue_id}/dismiss", headers=_auth())
        assert response.status_code == 404

        conn = psycopg2.connect(settings.database_url)
        with conn.cursor() as cur:
            cur.execute("SELECT dismissed FROM issues WHERE id = %s", (issue_id,))
            assert cur.fetchone()[0] is False
        conn.close()
    finally:
        _cleanup_project(project_a)
        _cleanup_project(project_b)


def test_apply_fix_409s_for_already_resolved_issue(client):
    create = client.post("/api/v1/projects", headers=_auth(), json={"name": "test-apply-fix-conflict"})
    project_id = create.json()["project_id"]
    try:
        issue_id = _insert_issue(project_id, fix_applied=True, proposed_fix_description=None)
        response = client.post(f"/api/v1/projects/{project_id}/issues/{issue_id}/apply-fix", headers=_auth())
        assert response.status_code == 409
    finally:
        _cleanup_project(project_id)


def test_get_profile_returns_jwt_claims(client):
    token = _make_token(email="owner@example.com", user_metadata={"display_name": "Test Owner"})
    response = client.get("/api/v1/user/profile", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "owner@example.com"
    assert body["display_name"] == "Test Owner"


# PUT /api/v1/user/profile and DELETE /api/v1/user/account both call the real
# Supabase Admin API (update_user_by_id / delete_user) against a live auth
# user -- intentionally not covered here, same reasoning as why
# test_architect.py doesn't fire extra real LLM calls just for coverage.
