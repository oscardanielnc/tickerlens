"""SEC EDGAR provider — quarterly/annual fundamentals from official XBRL filings.

Uses the free `companyfacts` API. EDGAR requires a descriptive User-Agent
with contact info. Values are extracted by period duration (a ~90-day fact
is a quarter, ~365-day is a fiscal year) because XBRL "frames" have gaps:
annual filers only report Q4 inside the 10-K, so Q4 is derived as
FY - (Q1+Q2+Q3) when the sibling quarters are present.
Docs: https://www.sec.gov/edgar/sec-api-documentation
"""

from datetime import date, timedelta

import httpx
from fastapi import HTTPException
from pydantic import BaseModel

from app.core.cache import get_or_set
from app.core.config import get_settings

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"

# XBRL tag fallbacks, in preference order (filers use different tags)
TAGS = {
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
    ],
    "net_income": ["NetIncomeLoss"],
    "gross_profit": ["GrossProfit"],
    "operating_expenses": ["OperatingExpenses", "CostsAndExpenses"],
}


class FinancialsPeriod(BaseModel):
    period: str  # calendar-quarter label of the period end, e.g. "2025Q3", or "2025"
    end_date: str
    revenue: float | None = None
    net_income: float | None = None
    gross_profit: float | None = None
    operating_expenses: float | None = None


class Fundamentals(BaseModel):
    ticker: str
    quarterly: list[FinancialsPeriod]  # oldest -> newest, up to 8
    annual: list[FinancialsPeriod]  # oldest -> newest, up to 4
    source_url: str


def _parse(day: str) -> date:
    return date.fromisoformat(day)


def _extract_metric(gaap: dict, tags: list[str]) -> tuple[dict[str, float], dict[str, float]]:
    """Return ({quarter_end: value}, {fy_end: value}) from the best-covered tag.

    Filers use different tags for the same concept (NVDA files `Revenues`,
    AAPL files `RevenueFromContractWithCustomer...`), so pick the candidate
    with the most quarterly data points in the last ~3 years — total count
    would favor tags long since abandoned. Entries appear in filing order,
    so later (amended/audited) values overwrite earlier ones per period end.
    """
    cutoff = date.today() - timedelta(days=1100)
    best: tuple[dict[str, float], dict[str, float]] = ({}, {})
    best_recent = 0
    for tag in tags:
        units = gaap.get(tag, {}).get("units", {}).get("USD", [])
        quarterly: dict[str, tuple[str, float]] = {}
        annual: dict[str, tuple[str, float]] = {}
        for item in units:
            start, end, value = item.get("start"), item.get("end"), item.get("val")
            if not (start and end and value is not None):
                continue
            days = (_parse(end) - _parse(start)).days
            if 80 <= days <= 100:
                quarterly[end] = (start, float(value))
            elif 350 <= days <= 380:
                annual[end] = (start, float(value))
        recent = sum(1 for end in quarterly if _parse(end) >= cutoff)
        if len(quarterly) < 4 or recent <= best_recent:
            continue
        best_recent = recent
        q_values = {end: value for end, (_, value) in quarterly.items()}
        # Derive the quarter only reported inside the 10-K: FY - sum(siblings)
        for fy_end, (fy_start, fy_value) in annual.items():
            if fy_end in q_values:
                continue
            siblings = [
                value
                for end, (start, value) in quarterly.items()
                if _parse(fy_start) - timedelta(days=10) <= _parse(start)
                and _parse(end) < _parse(fy_end)
            ]
            if len(siblings) == 3:
                q_values[fy_end] = fy_value - sum(siblings)
        best = (q_values, {end: value for end, (_, value) in annual.items()})
    return best


def _quarter_label(end: str) -> str:
    day = _parse(end)
    return f"{day.year}Q{(day.month - 1) // 3 + 1}"


class EdgarProvider:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(timeout=20, follow_redirects=True)
        self._headers = {"User-Agent": get_settings().edgar_user_agent}

    async def _ticker_to_cik(self, ticker: str) -> int:
        async def fetch() -> dict:
            response = await self._client.get(TICKERS_URL, headers=self._headers)
            response.raise_for_status()
            return {row["ticker"].upper(): row["cik_str"] for row in response.json().values()}

        mapping = await get_or_set("edgar:tickers", 86400, fetch)
        cik = mapping.get(ticker.upper())
        if cik is None:
            raise HTTPException(status_code=404, detail=f"No SEC filings found for {ticker}")
        return cik

    async def get_fundamentals(self, ticker: str) -> Fundamentals:
        cik = await self._ticker_to_cik(ticker)
        response = await self._client.get(FACTS_URL.format(cik=cik), headers=self._headers)
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"No XBRL facts for {ticker}")
        response.raise_for_status()
        gaap = response.json().get("facts", {}).get("us-gaap", {})

        quarterly_by_metric: dict[str, dict[str, float]] = {}
        annual_by_metric: dict[str, dict[str, float]] = {}
        for metric, tags in TAGS.items():
            quarterly_by_metric[metric], annual_by_metric[metric] = _extract_metric(gaap, tags)

        def build(
            by_metric: dict[str, dict[str, float]], quarterly: bool
        ) -> list[FinancialsPeriod]:
            ends = sorted({end for data in by_metric.values() for end in data})
            periods = []
            for end in ends:
                values = {m: data[end] for m, data in by_metric.items() if end in data}
                if "revenue" not in values and "net_income" not in values:
                    continue
                label = _quarter_label(end) if quarterly else str(_parse(end).year)
                periods.append(FinancialsPeriod(period=label, end_date=end, **values))
            return periods[-8:] if quarterly else periods[-4:]

        return Fundamentals(
            ticker=ticker.upper(),
            quarterly=build(quarterly_by_metric, quarterly=True),
            annual=build(annual_by_metric, quarterly=False),
            source_url=(
                "https://www.sec.gov/cgi-bin/browse-edgar"
                f"?action=getcompany&CIK={cik:010d}&type=10-K&dateb=&owner=include&count=10"
            ),
        )
