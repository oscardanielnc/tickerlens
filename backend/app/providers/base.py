"""Provider interfaces.

Every external data source implements one of these protocols, so providers can
be swapped (or mocked in tests) without touching services. All returned items
carry a `source_url` — the UI links every fact to where it came from.
"""

from datetime import date, datetime
from typing import Protocol

from pydantic import BaseModel


class Quote(BaseModel):
    ticker: str
    price: float
    change_percent: float
    as_of: datetime
    source_url: str


class Candle(BaseModel):
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class CompanyProfile(BaseModel):
    ticker: str
    name: str
    exchange: str | None = None
    sector: str | None = None
    industry: str | None = None
    description: str | None = None
    website: str | None = None
    market_cap: float | None = None
    source_url: str


class NewsItem(BaseModel):
    headline: str
    summary: str | None = None
    published_at: datetime
    source_name: str
    source_url: str
    tickers: list[str] = []


class EarningsEvent(BaseModel):
    ticker: str
    date: date
    hour: str | None = None  # "amc" | "bmo"
    eps_estimate: float | None = None
    revenue_estimate: float | None = None
    source_url: str


class MarketDataProvider(Protocol):
    async def get_quote(self, ticker: str) -> Quote: ...

    async def get_daily_candles(self, ticker: str, days: int) -> list[Candle]: ...

    async def get_profile(self, ticker: str) -> CompanyProfile: ...


class NewsProvider(Protocol):
    async def get_company_news(self, ticker: str, hours: int) -> list[NewsItem]: ...


class EarningsProvider(Protocol):
    async def get_upcoming_earnings(self, ticker: str, days_ahead: int) -> list[EarningsEvent]: ...
