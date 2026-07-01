import bleach

# Strips HTML/script tags from free-text fields before they're stored.
# Deliberately a separate module from app/memory/sanitize.py -- that file's
# sanitize_content() strips secret-SHAPED text (Rule 6) and runs
# unconditionally inside store_memory() for every memory write, including
# AI-authored content that was never HTML in the first place. This is
# called explicitly at the API layer, only on specific user-authored fields
# that get displayed back in a UI context (project name/description).
def strip_html(text: str) -> str:
    return bleach.clean(text, tags=[], attributes={}, strip=True)
