"""AI synthesis of the analysis narrative.

The AI receives ONLY facts computed in code (numbered F1..Fn) and recent
news headlines (numbered N1..Nm, each with a URL). It writes a markdown
narrative citing every claim as [F3] or [N2]; the frontend resolves those
markers to links/tooltips. It is explicitly forbidden from inventing
numbers or predicting prices — everything must trace back to a citation.
"""

from pydantic import BaseModel

from app.providers.base import CompanyProfile, EarningsEvent, NewsItem, Quote
from app.providers.edgar import Fundamentals
from app.providers.finnhub import ValuationMetrics
from app.services.levels import LevelsResult
from app.services.technical import TechnicalSnapshot


class Fact(BaseModel):
    ref: str  # F1..Fn / N1..Nm
    text: str
    source_url: str | None = None


SYSTEM_PROMPT = """You are the analysis writer for TickerLens, an educational equity research tool.

Rules, in order of priority:
1. Use ONLY the numbered facts (F*) and news (N*) provided. Never invent numbers, events or dates.
2. Cite every factual claim with its reference in square brackets, e.g. [F3] or [N2]. \
A sentence without a citation must be a neutral connector, not a claim.
3. Do NOT predict prices. You may reference the code-computed support/resistance levels as \
scenarios ("if price reaches the support at ... [F8]").
4. This is not financial advice and you must not phrase anything as a recommendation to buy \
or sell. Use "signals suggest", "data shows".
5. Write in {language}. Plain language: translate financial jargon for a non-expert reader.
6. Be DENSE, never redundant. The reader already sees the price, market cap, chart, levels \
and indicator values on screen — never restate a number as filler. Every sentence must add \
a signal, a cause, or a consequence an investor cares about. No throat-clearing phrases.

Output exactly this markdown structure (keep the headings in {language}):

## {h_summary}
2 sentences max: what the company does, and the single most important thing happening with \
it right now. Do NOT mention the current price or market cap.

## {h_short}
3-5 signals for the coming days/weeks. One bullet each, prefixed with an emoji verdict: \
"- ✅ " if the signal is bullish, "- ❌ " if bearish, "- ⚠️ " if mixed/warning. Mix technical \
and news/fundamental signals; do not repeat the same underlying fact twice. Example format: \
"- ❌ Sector-wide pullback after Broadcom's weak guidance [N3]"

## {h_long}
3-5 signals for the coming quarters/years, same bullet format (✅/❌/⚠️). Focus on revenue \
and margin trajectory, competitive position, structural risks — cite EDGAR fundamentals facts.

## {h_outlook}
2 sentences max weighing the evidence above. No price targets."""

HEADINGS = {
    "en": {
        "h_summary": "Summary",
        "h_short": "Short term",
        "h_long": "Long term",
        "h_outlook": "Outlook",
        "language": "English",
    },
    "es": {
        "h_summary": "Resumen",
        "h_short": "Corto plazo",
        "h_long": "Largo plazo",
        "h_outlook": "Balance",
        "language": "Spanish",
    },
}


def build_facts(
    quote: Quote,
    profile: CompanyProfile,
    technical: TechnicalSnapshot,
    levels: LevelsResult,
    earnings: list[EarningsEvent],
    news: list[NewsItem],
    fundamentals: Fundamentals | None = None,
    valuation: ValuationMetrics | None = None,
) -> list[Fact]:
    tech_url = quote.source_url
    facts: list[str | tuple[str, str]] = [
        f"{profile.name} ({quote.ticker}) trades on {profile.exchange}, "
        f"sector: {profile.sector or 'n/a'}, market cap ${(profile.market_cap or 0) / 1e9:.0f}B.",
        f"Current price ${technical.price} ({technical.change_percent_day:+.2f}% today).",
        f"Trend: {technical.trend}; price vs EMA20 ${technical.ema20}"
        + (f" / EMA50 ${technical.ema50}" if technical.ema50 else "")
        + (f" / EMA200 ${technical.ema200}." if technical.ema200 else "."),
        f"RSI(14) is {technical.rsi14} ({technical.rsi_state}); MACD is {technical.macd_state}"
        f" ({technical.macd_cross.replace('_', ' ')}); volume is {technical.volume_state}.",
        f"52-week range ${technical.low_52w}-${technical.high_52w}; price is "
        f"{technical.distance_to_52w_high_pct}% from the 52-week high.",
        f"Trend Template (stage-2 uptrend checklist): {technical.trend_template.passed}/"
        f"{technical.trend_template.checked} conditions pass.",
    ]
    if technical.rs_vs_spy_3m is not None:
        facts.append(
            f"3-month performance vs S&P 500 (SPY): "
            f"{technical.rs_vs_spy_3m:+.2f} percentage points."
        )
    if levels.supports:
        described = ", ".join(
            f"${lv.price} ({lv.distance_percent}%, strength {lv.strength}/5)"
            for lv in levels.supports[:3]
        )
        facts.append(f"Computed support levels below price: {described}.")
    if levels.resistances:
        described = ", ".join(
            f"${lv.price} ({lv.distance_percent}%, strength {lv.strength}/5)"
            for lv in levels.resistances[:3]
        )
        facts.append(f"Computed resistance levels above price: {described}.")
    for event in earnings[:1]:
        facts.append(
            f"Next earnings report: {event.date.isoformat()}"
            + (f" ({event.hour})" if event.hour else "")
            + (f", EPS estimate {event.eps_estimate}." if event.eps_estimate else ".")
        )

    fundamental_facts: list[str] = []
    if fundamentals and len(fundamentals.quarterly) >= 5:
        q = fundamentals.quarterly
        latest, year_ago = q[-1], q[-5]

        def yoy(now: float | None, then: float | None) -> str:
            if not now or not then or then == 0:
                return ""
            return f" ({(now / then - 1) * 100:+.0f}% YoY)"

        if latest.revenue:
            fundamental_facts.append(
                f"Revenue (SEC filing, quarter ending {latest.end_date}): "
                f"${latest.revenue / 1e9:.1f}B{yoy(latest.revenue, year_ago.revenue)}."
            )
        if latest.net_income:
            margin = (
                f", net margin {latest.net_income / latest.revenue * 100:.0f}%"
                if latest.revenue
                else ""
            )
            fundamental_facts.append(
                f"Net income (SEC filing): ${latest.net_income / 1e9:.1f}B"
                f"{yoy(latest.net_income, year_ago.net_income)}{margin}."
            )
        if latest.operating_expenses and year_ago.operating_expenses:
            fundamental_facts.append(
                f"Operating expenses: ${latest.operating_expenses / 1e9:.1f}B"
                f"{yoy(latest.operating_expenses, year_ago.operating_expenses)}."
            )

    if valuation:
        ratios = [
            ("P/E (TTM)", valuation.pe_ttm),
            ("PEG (TTM)", valuation.peg_ttm),
            ("P/S (TTM)", valuation.ps_ttm),
            ("EV/EBITDA (TTM)", valuation.ev_ebitda_ttm),
            ("P/B", valuation.pb),
            ("dividend yield %", valuation.dividend_yield_pct),
            ("ROE %", valuation.roe_pct),
            ("revenue growth YoY %", valuation.revenue_growth_yoy_pct),
        ]
        described = ", ".join(f"{name} {value}" for name, value in ratios if value is not None)
        if described:
            facts.append(f"Valuation ratios: {described}.")

    result = [
        Fact(ref=f"F{i + 1}", text=text, source_url=tech_url) for i, text in enumerate(facts)
    ]
    result += [
        Fact(
            ref=f"F{len(result) + i + 1}",
            text=text,
            source_url=fundamentals.source_url if fundamentals else None,
        )
        for i, text in enumerate(fundamental_facts)
    ]
    result += [
        Fact(
            ref=f"N{i + 1}",
            text=f"[{item.source_name}, {item.published_at.date().isoformat()}] {item.headline}",
            source_url=item.source_url,
        )
        for i, item in enumerate(news[:10])
    ]
    return result


def build_prompt(ticker: str, facts: list[Fact], lang: str) -> tuple[str, str]:
    headings = HEADINGS.get(lang, HEADINGS["en"])
    system = SYSTEM_PROMPT.format(**headings)
    lines = [f"Ticker: {ticker}", "", "FACTS (computed from market data):"]
    lines += [f"{f.ref}: {f.text}" for f in facts if f.ref.startswith("F")]
    lines += ["", "RECENT NEWS:"]
    news_facts = [f for f in facts if f.ref.startswith("N")]
    lines += [f"{f.ref}: {f.text}" for f in news_facts] or ["(no recent news)"]
    lines += ["", "Write the analysis now."]
    return "\n".join(lines), system
