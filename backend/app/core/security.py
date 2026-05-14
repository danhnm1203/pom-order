"""JWT verification for Supabase-issued user tokens.

Supabase CLI v2.84+ signs user session tokens with ES256 (asymmetric EC key).
We fetch the JWKS (JSON Web Key Set) from Supabase Auth and verify against it.

Legacy HS256 tokens (older Supabase / API keys baked into env) still supported
via the JWT_SECRET fallback. The token's own `alg` header decides which path.
"""

import logging
from functools import lru_cache
from typing import Any

import httpx
from jose import JWTError, jwt

from app.config import settings
from app.exceptions import ApiError


logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_jwks() -> dict[str, Any]:
    """Fetch and cache the JWKS from Supabase Auth (per-process cache).

    Restart backend if Supabase rotates its signing keys.
    """
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    response = httpx.get(url, timeout=5.0)
    response.raise_for_status()
    jwks: dict[str, Any] = response.json()
    logger.info(
        "Loaded JWKS from %s — %d keys", url, len(jwks.get("keys", []))
    )
    return jwks


def decode_supabase_token(token: str) -> dict[str, Any]:
    """Verify and decode a Supabase-issued JWT.

    Validates signature, expiry, and audience ('authenticated'). Issuer is not
    strictly checked because Supabase local sometimes uses `iss=supabase-demo`.
    Signature verification proves authenticity.
    """
    try:
        # Inspect token header ONLY to route to the correct verification path
        # (which key to use). Signature is verified by `jwt.decode` below before
        # any claim is trusted. This pattern is standard for multi-alg JWKS setups.
        header = jwt.get_unverified_header(token)  # NOSONAR S5659 — verified below
        alg = header.get("alg")

        if alg in ("ES256", "RS256"):
            # Modern asymmetric — use JWKS public key
            jwks = _get_jwks()
            payload: dict[str, Any] = jwt.decode(
                token,
                jwks,
                algorithms=[alg],
                audience="authenticated",
            )
        elif alg == "HS256":
            # Legacy symmetric — use shared secret
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
            raise ApiError(
                401, "invalid_token", f"Unsupported JWT algorithm: {alg}"
            )

        return payload
    except JWTError as exc:
        logger.warning(
            "JWT verification failed: %s | token prefix: %s...",
            str(exc),
            token[:20] if token else "(empty)",
        )
        raise ApiError(401, "invalid_token", f"Invalid or expired token: {exc}") from exc
    except httpx.HTTPError as exc:
        logger.exception("Failed to fetch JWKS from Supabase")
        raise ApiError(
            503, "auth_unavailable", "Cannot reach Supabase Auth for token verification"
        ) from exc
