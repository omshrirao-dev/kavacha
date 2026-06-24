import requests

from ._config import config


class KavachaError(Exception):
    pass


class NotInitializedError(KavachaError):
    pass


def request(method: str, path: str, json: dict | None = None, timeout: float = 5.0) -> dict:
    if not config.is_initialized:
        raise NotInitializedError("kavacha.init(api_key, project_id) must be called first")

    # The api_key lives ONLY in this header, built fresh on every call -- it
    # is never assigned to a variable that could end up in a log line, never
    # included in any exception message constructed below or by callers.
    response = requests.request(
        method,
        f"{config.base_url}{path}",
        json=json,
        headers={"Authorization": f"Bearer {config.api_key}"},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def safe_error_description(exc: Exception) -> str:
    """A description safe to print to stderr -- never the raw exception or
    request/response object, which could carry the Authorization header."""
    if isinstance(exc, NotInitializedError):
        return str(exc)
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if status:
        return f"HTTP {status}"
    if isinstance(exc, requests.exceptions.Timeout):
        return "request timed out"
    if isinstance(exc, requests.exceptions.ConnectionError):
        return "could not reach Kavacha (connection error)"
    return type(exc).__name__
