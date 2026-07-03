"""AI synthesis of the analysis narrative.

The AI receives ONLY facts computed in code (numbered F1..Fn) and recent
news headlines (numbered N1..Nm, each with a URL). It writes a markdown
narrative citing every claim as [F3] or [N2]; the frontend resolves those
markers to links/tooltips. It is explicitly forbidden from inventing
numbers or predicting prices — everything must trace back to a citation.
"""

from pydantic import BaseModel

from app.providers.base import CompanyProfile, EarningsEvent, NewsItem, Quote
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
5. Write in {language}. Keep it plain: translate financial jargon for a non-expert reader.

Output exactly this markdown structure (keep the headings in {language}):

## {h_summary}
2-3 sentences: what the company does and its current situation.

## {h_bull}
3-5 bullet points, each a positive signal (short- or long-term, tag which) with citations.

## {h_bear}
3-5 bullet points, each a risk or negative signal (short- or long-term, tag which) with citations.

## {h_levels}
2-3 sentences interpreting the computed support/resistance levels and what price zones matter, \
with citations.

## {h_outlook}
2-3 sentences weighing bull vs bear evidence. No price targets."""

HEADINGS = {
    "en": {
        "h_summary": "Summary",
        "h_bull": "Bull case",
        "h_bear": "Bear case",
        "h_levels": "Key levels",
        "h_outlook": "Outlook",
        "language": "English",
    },
    "es": {
        "h_summary": "Resumen",
        "h_bull": "Caso alcista",
        "h_bear": "Caso bajista",
        "h_levels": "Niveles clave",
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
) -> list[Fact]:
    tech_url = quote.source_url
    facts: list[str | tuple[str, str]] = [
        f"{profile.name} ({quote.ticker}) trades on {profile.exchange}, "
        f"sector: {profile.sector or 'n/a'}, market cap ${(profile.market_cap or 0) / 1e9:.0f}B.",
        f"Current price ${technical.price} ({technical.change_percent_day:+.2f}% today).",
        f"Trend: {technical.trend}; price vs EMA20 ${technical.ema20} / EMA50 ${technical.ema50}"
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

    result = [
        Fact(ref=f"F{i + 1}", text=text, source_url=tech_url) for i, text in enumerate(facts)
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
