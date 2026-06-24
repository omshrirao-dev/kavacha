import uuid

from app.db.database import get_connection
from app.memory.client import get_collection
from app.memory.sanitize import sanitize_content


def store_memory(
    project_id: str,
    stage: str,
    content: str,
    layer: str | None = None,
    decision_type: str | None = None,
    impact_level: str | None = None,
    source: str = "ai",
) -> str:
    memory_id = str(uuid.uuid4())
    sanitized = sanitize_content(content)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO project_memory
                    (id, project_id, stage, layer, content, decision_type, impact_level, embedding_vector, source)
                VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
                """,
                (memory_id, project_id, stage, layer, sanitized, decision_type, impact_level, memory_id, source),
            )

    get_collection().add(
        ids=[memory_id],
        documents=[sanitized],
        metadatas=[
            {
                "project_id": project_id,
                "stage": stage,
                "layer": layer or "",
                "decision_type": decision_type or "",
                "impact_level": impact_level or "",
                "source": source,
            }
        ],
    )
    return memory_id


def search_memory(project_id: str, query: str, n_results: int = 5, stage: str | None = None) -> list[dict]:
    where = {"project_id": project_id} if stage is None else {"$and": [{"project_id": project_id}, {"stage": stage}]}
    results = get_collection().query(
        query_texts=[query],
        n_results=n_results,
        where=where,
    )

    ids = results["ids"][0]
    if not ids:
        return []

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, project_id, stage, layer, content, decision_type,
                       impact_level, timestamp, source
                FROM project_memory
                WHERE id = ANY(%s::uuid[])
                """,
                (ids,),
            )
            columns = [col.name for col in cur.description]
            rows = {str(row[0]): dict(zip(columns, row, strict=True)) for row in cur.fetchall()}

    matches = []
    for memory_id, distance in zip(ids, results["distances"][0], strict=True):
        row = rows.get(memory_id)
        if row is None:
            continue
        matches.append({**row, "similarity_score": 1 - distance})
    return matches
