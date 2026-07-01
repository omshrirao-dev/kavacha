from typing import Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, field_validator

from app.core.audit import log_access
from app.core.limiter import limiter
from app.core.ownership import verify_project_owner
from app.core.sanitize_html import strip_html
from app.db.database import get_connection
from app.memory.engine import store_memory

router = APIRouter(prefix="/api/v1/projects", tags=["requirements"])

_CORE_PURPOSE_MAX_LEN = 200
_MUST_NEVER_DO_MAX_LEN = 200
_TARGET_AUDIENCE_MAX_LEN = 500
_SPECIFIC_RULES_MAX_LEN = 500
_SUCCESS_DEFINITION_MAX_LEN = 200

RESPONSE_STYLES = (
    "Formal and professional",
    "Friendly and conversational",
    "Technical and detailed",
    "Brief and to-the-point",
    "Empathetic and supportive",
)

# ms values the frontend's dropdown maps to -- "any" means no ceiling.
SPEED_REQUIREMENT_MS = {"1s": 1000, "2s": 2000, "3s": 3000, "5s": 5000, "any": None}


class ProjectRequirementsUpdate(BaseModel):
    core_purpose: str
    must_never_do: str
    response_style: Literal[RESPONSE_STYLES]  # type: ignore[valid-type]
    accuracy_threshold: Literal[80, 90, 95, 99]
    speed_requirement: Literal["1s", "2s", "3s", "5s", "any"]
    target_audience: str | None = None
    specific_rules: str | None = None
    success_definition: str | None = None

    @field_validator("core_purpose")
    @classmethod
    def _core_purpose_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _CORE_PURPOSE_MAX_LEN):
            raise ValueError(f"core_purpose must be between 1 and {_CORE_PURPOSE_MAX_LEN} characters")
        return strip_html(v)

    @field_validator("must_never_do")
    @classmethod
    def _must_never_do_bounds(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= _MUST_NEVER_DO_MAX_LEN):
            raise ValueError(f"must_never_do must be between 1 and {_MUST_NEVER_DO_MAX_LEN} characters")
        return strip_html(v)

    @field_validator("target_audience")
    @classmethod
    def _target_audience_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > _TARGET_AUDIENCE_MAX_LEN:
            raise ValueError(f"target_audience must be at most {_TARGET_AUDIENCE_MAX_LEN} characters")
        return strip_html(v) or None

    @field_validator("specific_rules")
    @classmethod
    def _specific_rules_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > _SPECIFIC_RULES_MAX_LEN:
            raise ValueError(f"specific_rules must be at most {_SPECIFIC_RULES_MAX_LEN} characters")
        return strip_html(v) or None

    @field_validator("success_definition")
    @classmethod
    def _success_definition_bounds(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > _SUCCESS_DEFINITION_MAX_LEN:
            raise ValueError(f"success_definition must be at most {_SUCCESS_DEFINITION_MAX_LEN} characters")
        return strip_html(v) or None


_FIELD_LABELS = {
    "core_purpose": "Core purpose",
    "must_never_do": "Must NEVER do",
    "response_style": "Response style",
    "accuracy_threshold": "Accuracy threshold",
    "speed_requirement": "Speed requirement",
    "target_audience": "Target audience",
    "specific_rules": "Specific rules",
    "success_definition": "Success definition",
}


def _store_requirements_memory(project_id: str, body: ProjectRequirementsUpdate) -> None:
    """Mirrors each field into append-only Project Memory, one entry per
    field, per the spec -- distinct from project_requirements' current-state
    row: this is the permanent decision-history log, not what CEO Review
    reads for its live evaluation."""
    for field, label in _FIELD_LABELS.items():
        value = getattr(body, field)
        if value in (None, ""):
            continue
        display_value = f"{value}%" if field == "accuracy_threshold" else value
        store_memory(
            project_id=project_id,
            stage="stage_5_client_requirements",
            content=f"{label}: {display_value}",
            layer="client_requirements",
            decision_type="requirement",
            impact_level="high" if field in ("core_purpose", "must_never_do") else None,
            source="human",
        )


def _row_to_dict(row, columns) -> dict:
    return dict(zip(columns, row, strict=True))


@router.get("/{project_id}/requirements")
def get_requirements(project_id: str, request: Request):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT core_purpose, must_never_do, response_style, accuracy_threshold,
                       speed_requirement_ms, target_audience, specific_rules, success_definition,
                       updated_at
                FROM project_requirements WHERE project_id = %s::uuid
                """,
                (project_id,),
            )
            row = cur.fetchone()
            columns = [col.name for col in cur.description]
    return _row_to_dict(row, columns) if row else None


@router.put("/{project_id}/requirements")
@limiter.limit("20/hour")
def upsert_requirements(project_id: str, request: Request, response: Response, body: ProjectRequirementsUpdate):
    owner_id = request.state.user["sub"]
    verify_project_owner(project_id, owner_id)

    speed_ms = SPEED_REQUIREMENT_MS[body.speed_requirement]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO project_requirements
                    (project_id, core_purpose, must_never_do, response_style, accuracy_threshold,
                     speed_requirement_ms, target_audience, specific_rules, success_definition)
                VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (project_id) DO UPDATE SET
                    core_purpose = EXCLUDED.core_purpose,
                    must_never_do = EXCLUDED.must_never_do,
                    response_style = EXCLUDED.response_style,
                    accuracy_threshold = EXCLUDED.accuracy_threshold,
                    speed_requirement_ms = EXCLUDED.speed_requirement_ms,
                    target_audience = EXCLUDED.target_audience,
                    specific_rules = EXCLUDED.specific_rules,
                    success_definition = EXCLUDED.success_definition,
                    updated_at = now()
                """,
                (
                    project_id,
                    body.core_purpose,
                    body.must_never_do,
                    body.response_style,
                    body.accuracy_threshold,
                    speed_ms,
                    body.target_audience,
                    body.specific_rules,
                    body.success_definition,
                ),
            )

    _store_requirements_memory(project_id, body)
    log_access(actor_id=owner_id, action="project_requirements_updated", outcome="success", resource=project_id)
    return {"status": "saved"}
