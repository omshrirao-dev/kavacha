from functools import lru_cache
from pathlib import Path

from app.core.config import settings


@lru_cache
def load_prompt(name: str) -> str:
    """Loads an agent's core system prompt from outside this repo's source
    tree -- the exact wording of each agent's persona/instructions is the
    one piece of this project kept private (see LICENSE). Locally this
    reads ./prompts/<name>.txt (gitignored); in production it reads from a
    Railway Volume path that was never part of the Docker build context.
    Both are configured via PROMPT_DIR, the same pattern CHROMA_PERSIST_DIR
    already uses for local-vs-production paths."""
    path = Path(settings.prompt_dir) / f"{name}.txt"
    if not path.exists():
        raise RuntimeError(
            f"Prompt '{name}' not found at {path}. This repo doesn't ship the actual prompt "
            "text -- see README.md / LICENSE. Write your own equivalent file at that path to run locally."
        )
    return path.read_text(encoding="utf-8")
