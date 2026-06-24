"""Kavacha -- autonomous AI maintenance infrastructure.

    import kavacha
    kavacha.init(api_key="kv_...", project_id="your-project-id")
    kavacha.watch(your_ai_app)

Three functions. Nothing in this SDK ever raises into your application --
a monitoring tool that crashes the thing it's monitoring is worse than one
that occasionally fails to log an event. Failures print a single warning
to stderr and your code keeps running.
"""

import functools
import sys
import time

from ._client import request, safe_error_description
from ._config import config

__all__ = ["init", "watch", "log_decision"]
__version__ = "0.1.0"

# Common top-level method names across LLM frameworks/custom wrappers.
# watch() patches whichever of these exist, IN PLACE, on the object you pass
# in -- that's what lets the bare `kavacha.watch(my_app)` statement work for
# objects. It does NOT auto-detect arbitrary frameworks (that's real, ongoing
# engineering work, not a one-line trick) -- it patches known method names.
_PATCHABLE_METHODS = ("invoke", "run", "generate", "predict", "chat")


def init(api_key: str, project_id: str, base_url: str | None = None) -> None:
    """Connect this process to Kavacha. Call once, before watch() or log_decision().

    api_key is never logged, printed, or included in any error message this
    SDK produces.
    """
    config.api_key = api_key
    config.project_id = project_id
    if base_url:
        config.base_url = base_url

    try:
        request("GET", "/api/v1/sdk/ping")
    except Exception as exc:
        _warn(
            f"could not verify connection ({safe_error_description(exc)}). "
            "Check your api_key and project_id -- watch() and log_decision() "
            "will keep trying but won't raise."
        )


def log_decision(decision: str, reason: str, layer: str | None = None) -> None:
    """Record a decision -- and WHY you made it -- into this project's
    permanent memory. This is Kavacha's core differentiator: six months from
    now, `why did we do this?` has a real, citable answer.
    """
    try:
        request(
            "POST",
            "/api/v1/sdk/decisions",
            json={"decision": decision, "reason": reason, "layer": layer},
        )
    except Exception as exc:
        _warn(f"failed to log decision ({safe_error_description(exc)})")


def watch(target):
    """Start observing calls through `target`.

    For an object (a LangChain chain, a custom client class, anything with an
    .invoke/.run/.generate/.predict/.chat method), this patches that method
    IN PLACE -- the bare statement `kavacha.watch(my_app)` is enough, because
    Python objects are mutable and the patched method replaces the original
    on that same instance.

    For a plain function, Python doesn't allow patching "in place" the same
    way -- reassign the return value instead:

        my_fn = kavacha.watch(my_fn)

    Only call metadata (timestamp, latency, success/failure) is ever sent --
    never the actual prompt or response content (Security Addendum Rule 5).
    """
    patched_any = False
    for method_name in _PATCHABLE_METHODS:
        original = getattr(target, method_name, None)
        if callable(original):
            try:
                setattr(target, method_name, _wrap(original))
                patched_any = True
            except (AttributeError, TypeError):
                pass  # some attributes aren't settable on this object -- skip it

    if not patched_any and callable(target):
        return _wrap(target)

    return target


def _wrap(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        start = time.monotonic()
        try:
            result = fn(*args, **kwargs)
            _report_event(success=True, started_at=start)
            return result
        except Exception as exc:
            _report_event(success=False, started_at=start, error_type=type(exc).__name__)
            raise

    return wrapper


def _report_event(success: bool, started_at: float, error_type: str | None = None) -> None:
    latency_ms = int((time.monotonic() - started_at) * 1000)
    try:
        request(
            "POST",
            "/api/v1/sdk/watch-events",
            json={"success": success, "latency_ms": latency_ms, "error_type": error_type},
        )
    except Exception:
        pass  # never let observability reporting break the host app


def _warn(message: str) -> None:
    print(f"[kavacha] {message}", file=sys.stderr)
