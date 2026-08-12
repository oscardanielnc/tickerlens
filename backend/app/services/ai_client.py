"""Async client for OpenAI-compatible chat APIs (DeepSeek by default).

Kept engine-agnostic: any provider exposing /chat/completions works by
changing DEEPSEEK_BASE_URL / model names in settings.
"""

import json
import logging
from collections.abc import AsyncIterator

import httpx
from fastapi import HTTPException

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _request_payload(
    prompt: str, system: str, model: str, temperature: float, stream: bool
) -> dict:
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "stream": stream,
    }


def _auth_headers() -> dict:
    settings = get_settings()
    if not settings.deepseek_api_key:
        raise HTTPException(status_code=503, detail="AI engine is not configured")
    return {"Authorization": f"Bearer {settings.deepseek_api_key}"}


async def stream_completion(
    prompt: str,
    system: str,
    model: str | None = None,
    temperature: float = 0.3,
) -> AsyncIterator[str]:
    """Yield content deltas from a streaming chat completion."""
    settings = get_settings()
    payload = _request_payload(
        prompt, system, model or settings.ai_model_narrative, temperature, stream=True
    )
    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10)) as client:
        async with client.stream(
            "POST",
            f"{settings.deepseek_base_url}/chat/completions",
            json=payload,
            headers=_auth_headers(),
        ) as response:
            if response.status_code != 200:
                # The upstream body can carry account, quota and request detail;
                # it belongs in our logs, not in a response any visitor can read.
                body = (await response.aread()).decode(errors="replace")[:500]
                logger.error(
                    "AI engine returned %s: %s", response.status_code, body
                )
                raise HTTPException(status_code=502, detail="AI engine error")
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[len("data: ") :]
                if data == "[DONE]":
                    return
                try:
                    delta = json.loads(data)["choices"][0]["delta"].get("content")
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if delta:
                    yield delta
