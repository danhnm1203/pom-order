"""URL shortener client — adurl.io.

API contract (confirmed via live test 2026-05-14):
  GET {adurl_api_url}?api={api_key}&url={long_url}&alias={optional_alias}
  Response (success): {"status": "success", "message": "", "shortenedUrl": "https://adurl.io/abc"}
  Response (error):   {"status": "error",   "message": "<reason>"}

Failure handling:
  - No API key configured → return None (caller falls back to long URL)
  - Timeout / network error → log warning, return None
  - API error → log warning, return None

Caller's job: handle None gracefully. NEVER block the user from sharing.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings


logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 8.0


async def shorten_url(
    long_url: str, *, custom_alias: str | None = None
) -> tuple[str | None, str | None]:
    """Shorten a URL via adurl.io.

    Returns (short_url, error_reason):
      - (str, None) on success
      - (None, str) on failure — error_reason is human-readable
      - (None, "disabled") if no API key configured
    """
    if not settings.adurl_api_key:
        logger.debug("URL shortener disabled (no ADURL_API_KEY)")
        return None, "disabled"

    params: dict[str, str] = {
        "api": settings.adurl_api_key,
        "url": long_url,
    }
    if custom_alias:
        params["alias"] = custom_alias

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(settings.adurl_api_url, params=params)
    except httpx.HTTPError as exc:
        logger.warning("URL shortener network error: %s", exc)
        return None, f"network_error: {exc}"

    if response.status_code >= 400:
        logger.warning(
            "URL shortener HTTP %d: %s", response.status_code, response.text[:200]
        )
        return None, f"http_{response.status_code}"

    try:
        data = response.json()
    except ValueError:
        logger.warning("URL shortener returned non-JSON: %s", response.text[:200])
        return None, "non_json_response"

    # adurl.io returns {"status": "success"|"error", "message": "...", "shortenedUrl": "..."}
    if data.get("status") != "success":
        message = data.get("message") or "unknown"
        # adurl.io often returns message as a list e.g. ["URL is invalid."]
        if isinstance(message, list):
            message = "; ".join(str(m) for m in message)
        logger.warning("URL shortener API error: %s", message)
        return None, str(message)

    short = data.get("shortenedUrl")
    if not short or not isinstance(short, str):
        logger.warning("URL shortener returned no shortenedUrl: %s", data)
        return None, "no_shortened_url_in_response"

    return short, None
