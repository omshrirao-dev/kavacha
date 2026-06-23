from fastapi import HTTPException

from app.db.database import get_connection


def verify_project_owner(project_id: str, owner_id: str) -> None:
    # 404, not 403 -- don't confirm to a non-owner that the project exists.
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM projects WHERE id = %s::uuid AND owner_id = %s::uuid",
                (project_id, owner_id),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Project not found")
