from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from supabase import Client, create_client


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    app_name: str = "kavacha"
    log_level: str = "INFO"

    supabase_url: str
    supabase_key: str
    supabase_jwt_secret: str

    database_url: str
    app_database_url: str

    anthropic_api_key: str

    # TEMP: gemini for dev. Switch to claude before deploy.
    # llm_provider defaults to "claude" so forgetting to set it never
    # silently leaves a deployment on the dev-only Gemini path.
    llm_provider: str = "claude"
    gemini_api_key: str | None = None
    groq_api_key: str | None = None

    chroma_persist_dir: str = "./chroma_data"

    # Where agent system prompts live -- never this repo's source tree. See
    # app/core/prompts.py. Same local-path-vs-Railway-volume-path pattern as
    # chroma_persist_dir above.
    prompt_dir: str = "./prompts"

    # No SendGrid account exists yet -- "log" always works (writes the plain-
    # language notification to the server log + audit trail) and is the safe
    # default. Set to "sendgrid" once SENDGRID_API_KEY is actually configured.
    notification_provider: str = "log"
    sendgrid_api_key: str | None = None
    notification_from_email: str = "alerts@kavacha.dev"

    # Comma-separated list of allowed frontend origins. Never "*" -- the
    # dashboard sends an Authorization header, and CORS forbids combining
    # a wildcard origin with credentialed requests anyway.
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_supabase_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


def get_supabase_admin_client() -> Client:
    """A fresh, never-cached client for admin-only calls (auth.admin.* --
    update_user_by_id, delete_user). Deliberately NOT get_supabase_client():
    that singleton is also used by /api/v1/auth/login's sign_in_with_password,
    which mutates the underlying GoTrue client's session state -- any
    admin.* call made afterward on that same cached instance silently runs
    as the just-signed-in user instead of the service-role key and fails
    with "User not allowed". Confirmed live: identical code, same key,
    works via a fresh client and fails via the shared one. A new Client
    here is cheap (an HTTP client wrapper, no real connection) so there's
    no caching upside worth the risk for this one."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


settings = get_settings()
