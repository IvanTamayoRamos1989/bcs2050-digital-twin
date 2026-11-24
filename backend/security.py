"""API Security Headers, Sliding-Window Rate Limiter, and Optional Planner RBAC Middleware."""

from __future__ import annotations

import hmac
import threading
import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from backend.config import (
    get_planner_api_tokens,
    get_rate_limits,
    require_auth_for_exports,
)

HEAVY_PATH_PREFIXES: tuple[str, ...] = (
    "/api/twin/export/",
    "/api/twin/simulate",
    "/api/twin/chat",
)

PROTECTED_EXPORT_PREFIX = "/api/twin/export/"
EXEMPT_PATHS: tuple[str, ...] = ("/api/twin/health",)
WINDOW_SECONDS = 60.0


class SlidingWindowRateLimiter:
    """Thread-safe 60-second sliding-window in-memory rate limiter keyed by (ip, bucket)."""

    def __init__(self, window_seconds: float = WINDOW_SECONDS) -> None:
        self._window = float(window_seconds)
        self._lock = threading.Lock()
        self._buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def check(self, client_ip: str, bucket: str, limit: int) -> tuple[bool, int, int]:
        """Return (allowed, remaining, retry_after_seconds)."""
        safe_limit = max(1, int(limit))
        now = time.monotonic()
        cutoff = now - self._window
        key = (client_ip, bucket)
        with self._lock:
            q = self._buckets[key]
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= safe_limit:
                oldest = q[0]
                retry_after = max(1, int(self._window - (now - oldest)) + 1)
                return False, 0, retry_after
            q.append(now)
            remaining = max(0, safe_limit - len(q))
            return True, remaining, 0

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


RATE_LIMITER = SlidingWindowRateLimiter()


def _extract_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "").strip()
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _extract_planner_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return request.headers.get("x-bcs-planner-token", "").strip()


def _is_valid_planner_token(candidate: str, valid_tokens: set[str]) -> bool:
    if not candidate or not valid_tokens:
        return False
    return any(hmac.compare_digest(candidate, tok) for tok in valid_tokens)


def _apply_security_headers(response: Response) -> Response:
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return response


class SecurityAndRateLimitMiddleware(BaseHTTPMiddleware):
    """Enforces baseline security headers, sliding-window rate limits, and optional planner export RBAC."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # Allow CORS preflight cleanly without consuming rate-limit budget
        if request.method == "OPTIONS":
            resp = await call_next(request)
            return _apply_security_headers(resp)

        # Static assets & health probe skip rate limiting / RBAC
        if not (path.startswith("/api/") or path.startswith("/FROST-Server/")) or path in EXEMPT_PATHS:
            resp = await call_next(request)
            return _apply_security_headers(resp)

        # Optional Planner RBAC for compute/data exports
        if path.startswith(PROTECTED_EXPORT_PREFIX) and require_auth_for_exports():
            candidate = _extract_planner_token(request)
            valid_tokens = get_planner_api_tokens()
            if not _is_valid_planner_token(candidate, valid_tokens):
                err = JSONResponse(
                    status_code=401,
                    content={
                        "detail": "Authentication required for export endpoints (missing or invalid Bearer / X-BCS-Planner-Token)."
                    },
                )
                return _apply_security_headers(err)

        heavy_limit, read_limit = get_rate_limits()
        is_heavy = any(path.startswith(prefix) for prefix in HEAVY_PATH_PREFIXES)
        bucket = "heavy" if is_heavy else "read"
        limit = heavy_limit if is_heavy else read_limit
        client_ip = _extract_client_ip(request)

        allowed, remaining, retry_after = RATE_LIMITER.check(client_ip, bucket, limit)
        if not allowed:
            err = JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded for '{bucket}' endpoints ({limit} requests/min). Retry in {retry_after}s."
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )
            return _apply_security_headers(err)

        resp = await call_next(request)
        resp.headers["X-RateLimit-Limit"] = str(limit)
        resp.headers["X-RateLimit-Remaining"] = str(remaining)
        return _apply_security_headers(resp)
