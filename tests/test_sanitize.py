from app.memory.sanitize import sanitize_content


def test_redacts_anthropic_key():
    out = sanitize_content("key was sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789")
    assert "sk-ant-" not in out
    assert "[REDACTED:ANTHROPIC_KEY]" in out


def test_redacts_jwt():
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ"
    out = sanitize_content(f"token={jwt}")
    assert jwt not in out


def test_redacts_db_connection_string():
    out = sanitize_content("DATABASE_URL=postgresql://admin:supersecret@db.host:5432/prod")
    assert "supersecret" not in out
    assert "postgresql://[REDACTED:DB_CREDENTIALS]@" in out


def test_redacts_key_value_secret():
    out = sanitize_content("password=hunter2 and the rest of the sentence stays")
    assert "hunter2" not in out
    assert "and the rest of the sentence stays" in out


def test_redacts_email():
    out = sanitize_content("contact ops@acmecorp.com for access")
    assert "ops@acmecorp.com" not in out
    assert "[REDACTED:EMAIL]" in out


def test_preserves_non_sensitive_architectural_text():
    text = "We set chunk_size=500 for the RAG pipeline to reduce cost during the MVP phase."
    assert sanitize_content(text) == text
