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
from app.providers.edgar import EdgarProvider, Fundamentals
from app.providers.finnhub import FinnhubProvider, ValuationMetrics
from app.services import rag, verdict
from app.services.ai_client import stream_completion
from app.services.levels import LevelsResult, compute_levels
from app.services.synthesis import Fact, build_facts, build_prompt
from app.services.technical import TechnicalSnapshot, compute_technical

router = APIRouter(tags=["analysis"])
settings = get_settings()

_TICKER_RE = re.compile(r"^[A-Za-z.\-]{1,6}$")

finnhub = FinnhubProvider()
alpaca = AlpacaProvider()
edgar = EdgarProvider()


class AnalysisPayload(BaseModel):
    ticker: str
    quote: Quote
    profile: CompanyProfile
    candles: list[Candle]
    technical: TechnicalSnapshot
    levels: LevelsResult
    earnings: list[EarningsEvent]
    news: list[NewsItem]
    fundamentals: Fundamentals | None
    valuation: ValuationMetrics | None
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
        fundamentals = await edgar.get_fundamentals(ticker)
    except HTTPException:
        fundamentals = None  # ETFs and foreign listings have no SEC facts
    try:
        valuation = await finnhub.get_valuation(ticker)
    except HTTPException:
        valuation = None

    try:
        technical = compute_technical(candles, spy)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    levels = compute_levels(candles)
    facts = build_facts(
        quote, profile, technical, levels, earnings, news, fundamentals, valuation
    )

    # Feed the retrieval index. Awaited rather than fired off as a background
    # task so a comparison requested right after an analysis finds the documents
    # already there; it only runs on a cache miss, and never raises.
    await rag.index_analysis(ticker, facts, news)

    return AnalysisPayload(
        ticker=ticker,
        quote=quote,
        profile=profile,
        candles=candles[-260:],
        technical=technical,
        levels=levels,
        earnings=earnings,
        news=news,
        fundamentals=fundamentals,
        valuation=valuation,
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


def _sse(stream) -> StreamingResponse:
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        # X-Accel-Buffering keeps the reverse proxy from holding the tokens back.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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

    return _sse(event_stream())


@router.get("/compare/verdict")
@limiter.limit(settings.rate_limit_analysis)
async def stream_compare_verdict(
    request: Request,
    a: str = Query(..., description="first ticker"),
    b: str = Query(..., description="second ticker"),
    lang: str = Query("en", pattern="^(en|es)$"),
) -> StreamingResponse:
    """RAG comparison of exactly two tickers, streamed.

    Retrieval reads what the analysis pipeline indexed, so both analyses are
    resolved first (cached — usually a no-op) to guarantee the index is warm
    even when a visitor lands on /compare directly.
    """
    ticker_a, ticker_b = _validate(a), _validate(b)
    if ticker_a == ticker_b:
        raise HTTPException(status_code=422, detail="Pick two different tickers")

    await _cached_analysis(ticker_a)
    await _cached_analysis(ticker_b)

    chunks = await rag.retrieve_for_pair(
        verdict.retrieval_query(ticker_a, ticker_b),
        (ticker_a, ticker_b),
        per_ticker=settings.rag_chunks_per_ticker,
    )
    if not chunks:
        raise HTTPException(status_code=503, detail="Retrieval index is unavailable")

    prompt, system = verdict.build_prompt(ticker_a, ticker_b, chunks, lang)

    async def event_stream():
        # Sources first, so the UI can render the citation list while tokens stream.
        sources = [
            {"ref": f"{c.ticker}/{c.ref}", "text": c.text, "source_url": c.source_url}
            for c in chunks
        ]
        yield f"data: {json.dumps({'sources': sources})}\n\n"
        try:
            async for delta in stream_completion(
                prompt, system, model=settings.ai_model_verdict
            ):
                yield f"data: {json.dumps({'delta': delta})}\n\n"
            yield "data: [DONE]\n\n"
        except HTTPException as exc:
            yield f"data: {json.dumps({'error': exc.detail})}\n\n"

    return _sse(event_stream())
