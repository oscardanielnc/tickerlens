"""Alpaca Market Data provider — daily OHLCV bars (IEX feed, free tier).

Docs: https://docs.alpaca.markets/reference/stockbars
"""

from datetime import UTC, datetime, timedelta

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.providers.base import Candle

BASE_URL = "https://data.alpaca.markets/v2"


class AlpacaProvider:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        settings = get_settings()
        self._client = client or httpx.AsyncClient(timeout=10)
        self._headers = {
            "APCA-API-KEY-ID": settings.alpaca_api_key,
            "APCA-API-SECRET-KEY": settings.alpaca_secret_key,
        }

    async def get_daily_candles(self, ticker: str, days: int = 365) -> list[Candle]:
        start = datetime.now(tz=UTC) - timedelta(days=days)
        candles: list[Candle] = []
        page_token: str | None = None

        while True:
            params: dict = {
                "timeframe": "1Day",
                "start": start.date().isoformat(),
                "limit": 10000,
                "adjustment": "split",
                "feed": "iex",
            }
            if page_token:
                params["page_token"] = page_token

            response = await self._client.get(
                f"{BASE_URL}/stocks/{ticker.upper()}/bars",
                params=params,
                headers=self._headers,
            )
            if response.status_code == 429:
                raise HTTPException(status_code=503, detail="Market data provider rate limit hit")
            response.raise_for_status()
            data = response.json()

            for bar in data.get("bars") or []:
                candles.append(
                    Candle(
                        ts=datetime.fromisoformat(bar["t"].replace("Z", "+00:00")),
                        open=bar["o"],
                        high=bar["h"],
                        low=bar["l"],
                        close=bar["c"],
                        volume=bar["v"],
                    )
                )
            page_token = data.get("next_page_token")
            if not page_token:
                break

        if not candles:
            raise HTTPException(status_code=404, detail=f"No price history for ticker {ticker}")
        return candles
