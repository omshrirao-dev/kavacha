import json
import logging
import re

from pydantic import BaseModel, Field
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.audit import log_access
from app.core.llm_provider import get_llm_response
from app.core.llm_usage import record_llm_usage
from app.core.prompts import load_prompt
from app.db.database import get_connection
from app.memory.engine import store_memory
from app.memory.sanitize import sanitize_content

logger = logging.getLogger("kavacha.architect")

STAGE = "stage_2_architect"

LAYER_NAMES = [
    "product_thinking",
    "architecture",
    "data",
    "security",
    "ai_specific",
    "infrastructure",
    "engineering_practices",
    "product_memory",
]


class DiscoveryAnswers(BaseModel):
    end_user_profile: str = Field(description="Who is the end user and what is their technical literacy?")
    data_sources: str = Field(description="What data does this AI use, and where does it live?")
    wrong_answer_handling: str = Field(description="What happens when the AI gives a wrong answer?")
    expected_traffic: str = Field(description="Expected traffic and concurrent users.")
    required_integrations: str = Field(description="Required integrations.")
    monthly_budget: str = Field(description="Monthly API cost budget.")
    user_languages: str = Field(description="What languages do end users speak?")
    success_metrics: str = Field(description="What does success look like, measurably?")


class LayerDecision(BaseModel):
    summary: str = Field(description="One-paragraph summary of this layer's approach.")
    decisions: list[str] = Field(description="Concrete, specific decisions made for this layer.")
    reasoning: str = Field(description="WHY these decisions were made.")
    impact_level: str = Field(description="One of: low, medium, high, critical.")


class ArchitectSpec(BaseModel):
    discovery: DiscoveryAnswers
    product_thinking: LayerDecision
    architecture: LayerDecision
    data: LayerDecision
    security: LayerDecision
    ai_specific: LayerDecision
    infrastructure: LayerDecision
    engineering_practices: LayerDecision
    product_memory: LayerDecision


# Full text lives outside this repo -- see app/core/prompts.py and LICENSE.
SYSTEM_PROMPT = load_prompt("architect")

_RESPONSE_FORMAT_INSTRUCTIONS = """
Respond with ONLY a single valid JSON object matching this exact JSON Schema. No \
markdown code fences, no commentary before or after -- the entire response must be \
the JSON object itself.

JSON Schema:
{schema}
"""

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _full_system_prompt() -> str:
    schema = json.dumps(ArchitectSpec.model_json_schema(), indent=2)
    return SYSTEM_PROMPT + "\n\n" + _RESPONSE_FORMAT_INSTRUCTIONS.format(schema=schema)


def _build_user_message(sanitized_idea: str) -> str:
    return f"<user_idea>\n{sanitized_idea}\n</user_idea>"


def _strip_markdown_fences(text: str) -> str:
    return _FENCE_RE.sub("", text.strip()).strip()


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=30))
def _call_architect_llm(sanitized_idea: str, project_id: str) -> ArchitectSpec:
    # The provider abstraction is plain text in/out (no LangChain tool-calling),
    # so structured output is enforced via prompt + manual JSON parsing here --
    # this is what makes the same parsing logic work for either provider.
    response = get_llm_response(prompt=_build_user_message(sanitized_idea), system_prompt=_full_system_prompt())
    # Record usage from every attempt, even ones that fail to parse below --
    # each attempt is a real billed call regardless of whether JSON parses.
    record_llm_usage(project_id, purpose="architect_run", response=response)
    cleaned = _strip_markdown_fences(response.text)
    parsed = json.loads(cleaned)
    return ArchitectSpec.model_validate(parsed)


def _create_project(name: str, owner_id: str) -> str:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO projects (name, owner_id) VALUES (%s, %s::uuid) RETURNING id",
                (name, owner_id),
            )
            return str(cur.fetchone()[0])


def run_architect_agent(idea: str, project_name: str, owner_id: str) -> dict:
    sanitized_idea = sanitize_content(idea)
    project_id = _create_project(project_name, owner_id)

    try:
        spec = _call_architect_llm(sanitized_idea, project_id)

        memory_entry_ids = []

        # The 8 discovery answers (incl. monthly budget) were previously only
        # returned in the API response, never persisted -- Cost Intelligence
        # (Track B) needs the approved budget to actually exist in memory.
        discovery_content = "\n".join(
            f"{field}: {value}" for field, value in spec.discovery.model_dump().items()
        )
        memory_entry_ids.append(
            store_memory(
                project_id=project_id,
                stage=STAGE,
                content=discovery_content,
                layer="discovery",
                decision_type="discovery_answers",
                impact_level="high",
                source="ai",
            )
        )

        for layer_name in LAYER_NAMES:
            layer: LayerDecision = getattr(spec, layer_name)
            content = (
                f"{layer_name} - {layer.summary}\n\n"
                "Decisions:\n" + "\n".join(f"- {d}" for d in layer.decisions) + "\n\n"
                f"Reasoning: {layer.reasoning}"
            )
            memory_id = store_memory(
                project_id=project_id,
                stage=STAGE,
                content=content,
                layer=layer_name,
                decision_type="architecture_spec",
                impact_level=layer.impact_level,
                source="ai",
            )
            memory_entry_ids.append(memory_id)

        log_access(
            actor_id=owner_id,
            action="architect_run",
            outcome="success",
            resource=project_id,
            metadata={"idea_preview": sanitized_idea[:200], "layers_generated": len(memory_entry_ids)},
        )

        return {
            "project_id": project_id,
            "spec": spec.model_dump(),
            "memory_entry_ids": memory_entry_ids,
        }
    except Exception as exc:
        logger.exception("architect run failed for project %s", project_id)
        log_access(
            actor_id=owner_id,
            action="architect_run",
            outcome="failed",
            resource=project_id,
            metadata={"error": type(exc).__name__},
        )
        raise
