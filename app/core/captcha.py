import logging

import requests

from app.core.config import settings

logger = logging.getLogger("kavacha.captcha")

HCAPTCHA_VERIFY_URL = "https://hcaptcha.com/siteverify"


def verify_captcha(token: str | None) -> bool:
    """Verifies an hCaptcha token via hCaptcha's siteverify endpoint.

    No-op (always passes) until HCAPTCHA_SECRET_KEY is set -- this repo has
    no hCaptcha account configured yet. To activate: set HCAPTCHA_SECRET_KEY
    in the environment (Railway variable / .env) to the secret key from the
    hCaptcha dashboard, and have the frontend render the hCaptcha widget and
    send its response token as LoginRequest.hcaptcha_token once the account
    has enough failed attempts to require it (see login_security.py's
    CAPTCHA_REQUIRED_AFTER_ATTEMPTS). Nothing else needs to change here.
    """
    if not settings.hcaptcha_secret_key:
        return True

    if not token:
        return False

    try:
        response = requests.post(
            HCAPTCHA_VERIFY_URL,
            data={"secret": settings.hcaptcha_secret_key, "response": token},
            timeout=5,
        )
        return bool(response.json().get("success"))
    except Exception:
        logger.exception("hCaptcha verification request failed")
        # Fail closed: if the CAPTCHA is turned on but unreachable, don't
        # silently let attempts through -- that would defeat the point of
        # having enabled it in the first place.
        return False
