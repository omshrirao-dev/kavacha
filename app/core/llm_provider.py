# TEMP: gemini/groq for dev. Switch to claude before deploy.
# This module exists only because Anthropic billing is blocked during V1
# testing. LLM_PROVIDER in .env is the single switch back to "claude".

from dataclasses import dataclass

import anthropic
from google import genai
from google.genai import types
from groq import Groq

from app.core.config import settings

CLAUDE_MODEL = "claude-sonnet-4-6"
# TEMP: gemini for dev. Switch to claude before deploy.
# gemini-1.5-flash (as originally specified) is deprecated and returns 404 --
# confirmed live against the Gemini API's ListModels endpoint. gemini-2.5-flash
# is the current stable, non-preview model in the same fast/cheap tier.
GEMINI_MODEL = "gemini-2.5-flash"
# TEMP: groq for dev. Switch to claude before deploy.
# Anthropic billing was still blocked when this was added -- confirmed live
# against Groq's /models endpoint.
GROQ_MODEL = "llama-3.3-70b-versatile"

# Approximate USD per 1M tokens. These are best-effort estimates for cost
# trajectory purposes -- reconcile against actual provider billing dashboards
# before treating any single number as authoritative.
_PRICING_PER_1M_TOKENS = {
    ("claude", CLAUDE_MODEL): {"input": 3.0, "output": 15.0},
    ("gemini", GEMINI_MODEL): {"input": 0.30, "output": 2.50},
    ("groq", GROQ_MODEL): {"input": 0.59, "output": 0.79},
}


@dataclass
class LLMResponse:
    text: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int

    @property
    def estimated_cost_usd(self) -> float:
        pricing = _PRICING_PER_1M_TOKENS.get((self.provider, self.model))
        if pricing is None:
            return 0.0
        return (self.input_tokens * pricing["input"] + self.output_tokens * pricing["output"]) / 1_000_000


def _claude_response(prompt: str, system_prompt: str) -> LLMResponse:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        temperature=0,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}],
    )
    return LLMResponse(
        text=message.content[0].text,
        provider="claude",
        model=CLAUDE_MODEL,
        input_tokens=message.usage.input_tokens,
        output_tokens=message.usage.output_tokens,
    )


def _gemini_response(prompt: str, system_prompt: str) -> LLMResponse:
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
    usage = response.usage_metadata
    return LLMResponse(
        text=response.text,
        provider="gemini",
        model=GEMINI_MODEL,
        input_tokens=usage.prompt_token_count or 0,
        output_tokens=usage.candidates_token_count or 0,
    )


def _groq_response(prompt: str, system_prompt: str) -> LLMResponse:
    # TEMP: groq for dev. Switch to claude before deploy.
    if not settings.groq_api_key:
        raise RuntimeError("LLM_PROVIDER=groq but GROQ_API_KEY is not set")

    client = Groq(api_key=settings.groq_api_key)
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
    )
    return LLMResponse(
        text=completion.choices[0].message.content,
        provider="groq",
        model=GROQ_MODEL,
        input_tokens=completion.usage.prompt_tokens,
        output_tokens=completion.usage.completion_tokens,
    )


def get_llm_response(prompt: str, system_prompt: str) -> LLMResponse:
    if settings.llm_provider == "gemini":
        return _gemini_response(prompt, system_prompt)
    if settings.llm_provider == "groq":
        return _groq_response(prompt, system_prompt)
    if settings.llm_provider == "claude":
        return _claude_response(prompt, system_prompt)
    raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider!r}")
