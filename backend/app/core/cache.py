"""Tiny async-safe in-memory TTL cache.

Protects provider rate limits and AI spend on the public demo. Single-process
by design; if the deployment ever scales horizontally, swap for Redis behind
the same interface.
"""

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

_store: dict[str, tuple[float, Any]] = {}
_locks: dict[str, asyncio.Lock] = {}


async def get_or_set(key: str, ttl_seconds: int, factory: Callable[[], Awaitable[Any]]) -> Any:
    """Return the cached value for `key`, or await `factory` and cache it.

    A per-key lock ensures concurrent requests for the same key trigger a
    single upstream call.
    """
    now = time.monotonic()
    hit = _store.get(key)
    if hit and hit[0] > now:
        return hit[1]

    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _store.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        value = await factory()
        _store[key] = (time.monotonic() + ttl_seconds, value)
        return value


def clear() -> None:
    _store.clear()
    _locks.clear()
