# TEMP: gemini for dev. Switch to claude before deploy.
# This module exists only because Anthropic billing is blocked during V1
# testing. LLM_PROVIDER in .env is the single switch back to "claude".

import anthropic
from google import genai
from google.genai import types

from app.core.config import settings

CLAUDE_MODEL = "claude-sonnet-4-6"
# TEMP: gemini for dev. Switch to claude before deploy.
# gemini-1.5-flash (as originally specified) is deprecated and returns 404 --
# confirmed live against the Gemini API's ListModels endpoint. gemini-2.5-flash
# is the current stable, non-preview model in the same fast/cheap tier.
GEMINI_MODEL = "gemini-2.5-flash"


def _claude_response(prompt: str, system_prompt: str) -> str:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        temperature=0,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _gemini_response(prompt: str, system_prompt: str) -> str:
    # TEMP: gemini for dev. Switch to claude before deploy.
    if not settings.gemini_api_key:
        raise RuntimeError("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set")

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0,
            response_mime_type="application/json",
        ),
    )
    return response.text


def get_llm_response(prompt: str, system_prompt: str) -> str:
    if settings.llm_provider == "gemini":
        return _gemini_response(prompt, system_prompt)
    if settings.llm_provider == "claude":
        return _claude_response(prompt, system_prompt)
    raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider!r}")
