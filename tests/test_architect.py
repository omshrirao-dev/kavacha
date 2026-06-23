import time

import jwt
import psycopg2
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.database import close_pool, init_pool
from app.main import app
from app.memory.client import get_collection
from app.memory.engine import search_memory
from app.services.architect_agent import run_architect_agent

REAL_IDEA = "Build an AI customer support chatbot for an Indian e-commerce company with 10,000 daily users"
OWNER_ID = "00000000-0000-0000-0000-000000000000"


def _make_token():
    now = int(time.time())
    return jwt.encode(
        {"sub": OWNER_ID, "aud": "authenticated", "role": "authenticated", "iat": now, "exp": now + 3600},
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


def _cleanup_project(project_id: str):
    get_collection().delete(where={"project_id": project_id})
    conn = psycopg2.connect(settings.database_url)
    with conn.cursor() as cur:
        cur.execute("DELETE FROM projects WHERE id = %s", (project_id,))
    conn.commit()
    conn.close()


def _cleanup_project_by_name(name: str):
    conn = psycopg2.connect(settings.database_url)
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM projects WHERE name = %s", (name,))
        row = cur.fetchone()
    conn.close()
    if row:
        _cleanup_project(str(row[0]))


def test_architect_run_end_to_end():
    token = _make_token()
    project_name = "indian-ecommerce-support-bot"
    project_id = None
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/architect/run",
                headers={"Authorization": f"Bearer {token}"},
                json={"idea": REAL_IDEA, "project_name": project_name},
            )

        assert response.status_code == 200, response.text
        body = response.json()
        project_id = body["project_id"]
        spec = body["spec"]

        # TestClient's lifespan closes the DB pool when its `with` block
        # exits -- re-init for the direct psycopg2/search_memory calls below.
        init_pool()

        # Spec covers all 8 layers completely
        layers = [
            "product_thinking",
            "architecture",
            "data",
            "security",
            "ai_specific",
            "infrastructure",
            "engineering_practices",
            "product_memory",
        ]
        for layer in layers:
            assert spec[layer]["summary"]
            assert spec[layer]["decisions"]
            assert spec[layer]["reasoning"]
        for question_field in [
            "end_user_profile",
            "data_sources",
            "wrong_answer_handling",
            "expected_traffic",
            "required_integrations",
            "monthly_budget",
            "user_languages",
            "success_metrics",
        ]:
            assert spec["discovery"][question_field]

        # Decisions stored in Project Memory
        assert len(body["memory_entry_ids"]) == 8
        conn = psycopg2.connect(settings.database_url)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM project_memory WHERE project_id = %s", (project_id,))
            count = cur.fetchone()[0]
        assert count == 8

        # Semantic search finds decisions correctly
        results = search_memory(project_id, "how will this scale to thousands of daily users", n_results=3)
        assert len(results) > 0

        # Audit log entry created
        with conn.cursor() as cur:
            cur.execute(
                "SELECT outcome FROM audit_log WHERE action = %s AND resource = %s",
                ("architect_run", project_id),
            )
            audit_rows = cur.fetchall()
        conn.close()
        assert any(row[0] == "success" for row in audit_rows)

        # Rate limiting active on this route — inspect headers from the real
        # call rather than firing 10+ paid Claude calls just to see a 429.
        assert "x-ratelimit-limit" in {k.lower() for k in response.headers.keys()}
    finally:
        if project_id:
            _cleanup_project(project_id)
        else:
            _cleanup_project_by_name(project_name)
        close_pool()


def test_architect_run_requires_jwt():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/architect/run",
            json={"idea": REAL_IDEA, "project_name": "no-auth-test"},
        )
    assert response.status_code == 401


def test_architect_sanitizes_idea_before_llm_call():
    fake_secret = "sk-ant-api03-totallyfakesecretvalue1234567890"
    idea_with_secret = (
        "Build a customer support chatbot. Internal note: our staging Anthropic "
        f"key is {fake_secret} -- make sure the architecture handles key rotation."
    )
    project_name = "sanitization-test-project"
    result = None
    init_pool()
    try:
        result = run_architect_agent(idea=idea_with_secret, project_name=project_name, owner_id=OWNER_ID)
        project_id = result["project_id"]

        assert fake_secret not in str(result["spec"])

        conn = psycopg2.connect(settings.database_url)
        with conn.cursor() as cur:
            cur.execute("SELECT content FROM project_memory WHERE project_id = %s", (project_id,))
            rows = cur.fetchall()
        conn.close()
        assert all(fake_secret not in row[0] for row in rows)
    finally:
        if result:
            _cleanup_project(result["project_id"])
        else:
            _cleanup_project_by_name(project_name)
        close_pool()
