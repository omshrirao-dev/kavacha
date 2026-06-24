from app.core.llm_provider import LLMResponse
from app.db.database import get_connection


def record_llm_usage(project_id: str, purpose: str, response: LLMResponse) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO llm_usage
                    (project_id, provider, model, input_tokens, output_tokens, estimated_cost_usd, purpose)
                VALUES (%s::uuid, %s, %s, %s, %s, %s, %s)
                """,
                (
                    project_id,
                    response.provider,
                    response.model,
                    response.input_tokens,
                    response.output_tokens,
                    response.estimated_cost_usd,
                    purpose,
                ),
            )
