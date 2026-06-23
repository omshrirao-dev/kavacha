import psycopg2
import pytest

from app.core.config import settings
from app.db.database import close_pool, init_pool
from app.memory.client import get_collection
from app.memory.engine import search_memory, store_memory


@pytest.fixture
def project_id():
    init_pool()
    conn = psycopg2.connect(settings.database_url)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO projects (name, owner_id) VALUES (%s, %s) RETURNING id",
            ("memory-engine-test", "00000000-0000-0000-0000-000000000000"),
        )
        pid = str(cur.fetchone()[0])
    conn.commit()

    yield pid

    # Postgres CASCADEs project_memory rows on project delete, but Chroma has
    # no FK relationship to Postgres — clean it up explicitly or test runs
    # leave orphaned vectors in the local dev store.
    get_collection().delete(where={"project_id": pid})
    with conn.cursor() as cur:
        cur.execute("DELETE FROM projects WHERE id = %s", (pid,))
    conn.commit()
    conn.close()
    close_pool()


def test_store_and_search_memory_semantically(project_id):
    store_memory(
        project_id=project_id,
        stage="stage_2_architect",
        content="We set chunk_size=500 for the RAG pipeline to keep embedding costs low during the MVP phase.",
        layer="retrieval",
        decision_type="cost_optimization",
        impact_level="medium",
    )
    store_memory(
        project_id=project_id,
        stage="stage_3_builder",
        content="Switched the auth provider from a custom JWT implementation to Supabase Auth to avoid maintaining our own token signing.",
        layer="auth",
        decision_type="architecture",
        impact_level="high",
    )
    store_memory(
        project_id=project_id,
        stage="stage_2_architect",
        content="Picked PostgreSQL over MongoDB for structured metadata because the schema is well-defined and relational joins between issues and projects are central to the product.",
        layer="database",
        decision_type="architecture",
        impact_level="high",
    )

    results = search_memory(project_id, "why did we choose this database", n_results=3)

    assert len(results) > 0
    assert results[0]["decision_type"] == "architecture"
    assert "PostgreSQL" in results[0]["content"]
    assert results[0]["similarity_score"] > results[-1]["similarity_score"] or len(results) == 1


def test_store_memory_sanitizes_before_persisting(project_id):
    memory_id = store_memory(
        project_id=project_id,
        stage="stage_3_builder",
        content="rotated the key, new value is sk-ant-api03-totallyrealsecretvalue1234567890",
        layer="auth",
    )

    conn = psycopg2.connect(settings.database_url)
    with conn.cursor() as cur:
        cur.execute("SELECT content FROM project_memory WHERE id = %s", (memory_id,))
        stored_content = cur.fetchone()[0]
    conn.close()

    assert "sk-ant-" not in stored_content
    assert "[REDACTED:ANTHROPIC_KEY]" in stored_content

    results = search_memory(project_id, "key rotation", n_results=5)
    assert all("sk-ant-" not in r["content"] for r in results)
