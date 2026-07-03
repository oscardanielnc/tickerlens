"""Finnhub provider — quote, company profile, news and earnings calendar.

Free-tier endpoints only. Docs: https://finnhub.io/docs/api
"""

from datetime import UTC, date, datetime, timedelta

import httpx
from fastapi import HTTPException
from pydantic import BaseModel

from app.core.config import get_settings
from app.providers.base import CompanyProfile, EarningsEvent, NewsItem, Quote

BASE_URL = "https://finnhub.io/api/v1"


def _public_url(ticker: str) -> str:
    return f"https://finnhub.io/quote/{ticker.upper()}"


class ValuationMetrics(BaseModel):
    """Valuation & health ratios an investor checks first (Finnhub /stock/metric).

    Chosen set: P/E (classic earnings multiple), PEG (growth-adjusted, <1 cheap),
    P/S (works for unprofitable companies), EV/EBITDA (capital-structure neutral),
    P/B (asset-heavy/banks), dividend yield (shareholder return), plus margin,
    ROE and revenue growth as health context.
    """

    pe_ttm: float | None = None
    peg_ttm: float | None = None
    ps_ttm: float | None = None
    pb: float | None = None
    ev_ebitda_ttm: float | None = None
    ev_revenue_ttm: float | None = None
    dividend_yield_pct: float | None = None
    net_margin_pct: float | None = None
    roe_pct: float | None = None
    revenue_growth_yoy_pct: float | None = None
    source_url: str


class FinnhubProvider:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(timeout=10)
        self._api_key = get_settings().finnhub_api_key

    async def _get(self, path: str, params: dict) -> dict | list:
        response = await self._client.get(
            f"{BASE_URL}{path}",
            params={**params, "token": self._api_key},
        )
        if response.status_code == 429:
            raise HTTPException(status_code=503, detail="Market data provider rate limit hit")
        response.raise_for_status()
        return response.json()

    async def get_quote(self, ticker: str) -> Quote:
        data = await self._get("/quote", {"symbol": ticker})
        if not data or data.get("c") in (0, None):
            raise HTTPException(status_code=404, detail=f"No quote for ticker {ticker}")
        return Quote(
            ticker=ticker,
            price=data["c"],
            change_percent=data.get("dp") or 0.0,
            as_of=datetime.fromtimestamp(data["t"], tz=UTC),
            source_url=_public_url(ticker),
        )

    async def get_profile(self, ticker: str) -> CompanyProfile:
        data = await self._get("/stock/profile2", {"symbol": ticker})
        if not data or not data.get("name"):
            raise HTTPException(status_code=404, detail=f"Unknown ticker {ticker}")
        return CompanyProfile(
            ticker=ticker,
            name=data["name"],
            exchange=data.get("exchange"),
            sector=data.get("finnhubIndustry"),
            industry=data.get("finnhubIndustry"),
            website=data.get("weburl"),
            market_cap=(data.get("marketCapitalization") or 0) * 1_000_000 or None,
            source_url=data.get("weburl") or _public_url(ticker),
        )

    async def get_valuation(self, ticker: str) -> ValuationMetrics:
        data = await self._get("/stock/metric", {"symbol": ticker, "metric": "all"})
        metric = data.get("metric", {}) if isinstance(data, dict) else {}

        def get(key: str) -> float | None:
            value = metric.get(key)
            return round(float(value), 2) if isinstance(value, (int, float)) else None

        return ValuationMetrics(
            pe_ttm=get("peTTM"),
            peg_ttm=get("pegTTM"),
            ps_ttm=get("psTTM"),
            pb=get("pb"),
            ev_ebitda_ttm=get("evEbitdaTTM"),
            ev_revenue_ttm=get("evRevenueTTM"),
            dividend_yield_pct=get("currentDividendYieldTTM"),
            net_margin_pct=get("netProfitMarginTTM"),
            roe_pct=get("roeTTM"),
            revenue_growth_yoy_pct=get("revenueGrowthTTMYoy"),
            source_url=_public_url(ticker),
        )

    async def get_company_news(self, ticker: str, hours: int = 72) -> list[NewsItem]:
        today = date.today()
        since = today - timedelta(hours=hours) if hours >= 24 else today
        data = await self._get(
            "/company-news",
            {"symbol": ticker, "from": since.isoformat(), "to": today.isoformat()},
        )
        items = []
        for row in data if isinstance(data, list) else []:
            if not row.get("headline") or not row.get("url"):
                continue
            items.append(
                NewsItem(
                    headline=row["headline"],
                    summary=row.get("summary") or None,
                    published_at=datetime.fromtimestamp(row["datetime"], tz=UTC),
                    source_name=row.get("source") or "Finnhub",
                    source_url=row["url"],
                    tickers=[ticker],
                )
            )
        items.sort(key=lambda n: n.published_at, reverse=True)
        return items[:20]

    async def get_upcoming_earnings(self, ticker: str, days_ahead: int = 90) -> list[EarningsEvent]:
        today = date.today()
        data = await self._get(
            "/calendar/earnings",
            {
                "symbol": ticker,
                "from": today.isoformat(),
                "to": (today + timedelta(days=days_ahead)).isoformat(),
            },
        )
        events = []
        rows = data.get("earningsCalendar", []) if isinstance(data, dict) else []
        for row in rows:
            if row.get("epsActual") is not None:  # already reported
                continue
            events.append(
                EarningsEvent(
                    ticker=ticker,
                    date=date.fromisoformat(row["date"]),
                    hour=row.get("hour") or None,
                    eps_estimate=row.get("epsEstimate"),
                    revenue_estimate=row.get("revenueEstimate"),
                    source_url=f"https://finnhub.io/calendar/earnings?symbol={ticker.upper()}",
                )
            )
        events.sort(key=lambda e: e.date)
        return events
