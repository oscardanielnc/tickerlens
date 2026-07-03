"""Async client for OpenAI-compatible chat APIs (DeepSeek by default).

Kept engine-agnostic: any provider exposing /chat/completions works by
changing DEEPSEEK_BASE_URL / model names in settings.
"""

import json
from collections.abc import AsyncIterator

import httpx
from fastapi import HTTPException

from app.core.config import get_settings


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
        prompt, system, model or settings.ai_model_strong, temperature, stream=True
    )
    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10)) as client:
        async with client.stream(
            "POST",
            f"{settings.deepseek_base_url}/chat/completions",
            json=payload,
            headers=_auth_headers(),
        ) as response:
            if response.status_code != 200:
                detail = (await response.aread()).decode(errors="replace")[:500]
                raise HTTPException(status_code=502, detail=f"AI engine error: {detail}")
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
