import re

# Shared across monitor.py/ceo_review.py/compliance.py's project_id fields --
# each currently relies on a Postgres ::uuid cast to fail loudly on a
# malformed id, which works but produces a DB-flavored error path instead of
# a clean 422 at the request-validation layer.
UUID_PATTERN = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def is_uuid_shaped(value: str) -> bool:
    return bool(UUID_PATTERN.match(value))
