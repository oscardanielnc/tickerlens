"""Ticker analysis endpoints.

GET /api/analysis/{ticker}      -> full computed payload (no AI)
GET /api/analysis/{ticker}/ai   -> SSE stream of the AI narrative (en|es)

Both are cached and rate-limited: the public demo runs on the owner's
provider keys, so every request must be cheap by default.
"""

import json
import re

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.cache import get_or_set
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.providers.alpaca import AlpacaProvider
from app.providers.base import Candle, CompanyProfile, EarningsEvent, NewsItem, Quote
from app.providers.finnhub import FinnhubProvider
from app.services.ai_client import stream_completion
from app.services.levels import LevelsResult, compute_levels
from app.services.synthesis import Fact, build_facts, build_prompt
from app.services.technical import TechnicalSnapshot, compute_technical

router = APIRouter(tags=["analysis"])
settings = get_settings()

_TICKER_RE = re.compile(r"^[A-Za-z.\-]{1,6}$")

finnhub = FinnhubProvider()
alpaca = AlpacaProvider()


class AnalysisPayload(BaseModel):
    ticker: str
    quote: Quote
    profile: CompanyProfile
    candles: list[Candle]
    technical: TechnicalSnapshot
    levels: LevelsResult
    earnings: list[EarningsEvent]
    news: list[NewsItem]
    facts: list[Fact]  # numbered facts the AI narrative cites


def _validate(ticker: str) -> str:
    if not _TICKER_RE.match(ticker):
        raise HTTPException(status_code=422, detail="Invalid ticker symbol")
    return ticker.upper()


async def _spy_candles() -> list[Candle]:
    return await get_or_set("candles:SPY", 3600, lambda: alpaca.get_daily_candles("SPY", 420))


async def _build_analysis(ticker: str) -> AnalysisPayload:
    quote = await finnhub.get_quote(ticker)
    profile = await finnhub.get_profile(ticker)
    candles = await alpaca.get_daily_candles(ticker, 420)
    news = await finnhub.get_company_news(ticker, hours=72)
    earnings = await finnhub.get_upcoming_earnings(ticker)
    spy = await _spy_candles() if ticker != "SPY" else None

    try:
        technical = compute_technical(candles, spy)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    levels = compute_levels(candles)
    facts = build_facts(quote, profile, technical, levels, earnings, news)

    return AnalysisPayload(
        ticker=ticker,
        quote=quote,
        profile=profile,
        candles=candles[-260:],
        technical=technical,
        levels=levels,
        earnings=earnings,
        news=news,
        facts=facts,
    )


async def _cached_analysis(ticker: str) -> AnalysisPayload:
    return await get_or_set(
        f"analysis:{ticker}",
        settings.cache_ttl_analysis,
        lambda: _build_analysis(ticker),
    )


@router.get("/analysis/{ticker}")
@limiter.limit(settings.rate_limit_data)
async def get_analysis(request: Request, response: Response, ticker: str) -> AnalysisPayload:
    return await _cached_analysis(_validate(ticker))


@router.get("/analysis/{ticker}/ai")
@limiter.limit(settings.rate_limit_analysis)
async def stream_ai_narrative(
    request: Request,
    ticker: str,
    lang: str = Query("en", pattern="^(en|es)$"),
) -> StreamingResponse:
    payload = await _cached_analysis(_validate(ticker))
    prompt, system = build_prompt(payload.ticker, payload.facts, lang)

    async def event_stream():
        try:
            async for delta in stream_completion(prompt, system):
                yield f"data: {json.dumps({'delta': delta})}\n\n"
            yield "data: [DONE]\n\n"
        except HTTPException as exc:
            yield f"data: {json.dumps({'error': exc.detail})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
