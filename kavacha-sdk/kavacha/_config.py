import os


class _Config:
    api_key: str | None = None
    project_id: str | None = None
    # No real deployment exists yet (that's Week 3) -- defaults to local dev,
    # overridable via KAVACHA_API_URL or the optional init(base_url=...) arg.
    base_url: str = os.environ.get("KAVACHA_API_URL", "http://127.0.0.1:8000")

    @property
    def is_initialized(self) -> bool:
        return bool(self.api_key and self.project_id)


config = _Config()
