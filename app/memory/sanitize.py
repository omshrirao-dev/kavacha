import re


def _redact_db_creds(match: re.Match) -> str:
    return f"{match.group(1)}://[REDACTED:DB_CREDENTIALS]@"


# Security Addendum Rule 5: strip secrets/credentials before content reaches
# any embedding model or, later, any LLM prompt built from stored memory.
# This catches mechanically-detectable secret SHAPES (keys, tokens, connection
# strings, emails) — it does not do full PII named-entity recognition
# (free-text names/addresses need an actual NER model, out of scope for V1).
_PATTERNS = [
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"), "[REDACTED:ANTHROPIC_KEY]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"), "[REDACTED:JWT]"),
    (re.compile(r"Bearer\s+[A-Za-z0-9\-_.]{20,}", re.IGNORECASE), "Bearer [REDACTED:TOKEN]"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED:AWS_KEY]"),
    (
        re.compile(r"(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^:\s]+:[^@\s]+@", re.IGNORECASE),
        _redact_db_creds,
    ),
    (re.compile(r"(?i)(api[_-]?key|secret|password|access[_-]?token)\s*[=:]\s*\S+"), r"\1=[REDACTED:SECRET]"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[REDACTED:EMAIL]"),
]


def sanitize_content(text: str) -> str:
    sanitized = text
    for pattern, replacement in _PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized
