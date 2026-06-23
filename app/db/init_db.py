from pathlib import Path

import psycopg2

from app.core.config import settings


def run_migrations() -> None:
    schema_path = Path(__file__).parent / "schema.sql"
    sql = schema_path.read_text()

    conn = psycopg2.connect(settings.database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print("Schema applied: projects, project_memory, issues, monitor_tests, audit_log")
    finally:
        conn.close()


if __name__ == "__main__":
    run_migrations()
