"""Prompt for the head-to-head comparison of two tickers.

Unlike the per-ticker narrative, this prompt is fed *retrieved* context: the
chunks pgvector returned for the comparison query, not the whole analysis. That
is the point of the RAG path — the model sees the evidence most relevant to
"which of these two looks stronger right now" rather than every computed fact.

On framing: the app's narrative prompt forbids buy/sell recommendations, and
this one keeps that line. It is allowed to *pick a side* — a comparison that
refuses to conclude is useless — but it must pick on the evidence shown, name
what would change its mind, and stay a data comparison rather than advice.
"""

from app.services.rag import Chunk

SYSTEM_PROMPT = """You are the comparison writer for TickerLens, an educational \
equity research tool. Two tickers are compared head to head.

You are given EXCERPTS retrieved from TickerLens's own analysis index — computed \
facts (F*) and news (N*) for both companies. They are the only evidence you have.

Rules, in order of priority:
1. Use ONLY the numbered excerpts provided. Never invent numbers, events or dates. \
If the evidence for one company is thinner, say so rather than filling the gap.
2. Cite every factual claim with its reference, e.g. [{a}/F3] or [{b}/N2] — always \
prefix with the ticker, because both companies use the same F/N numbering.
3. You MUST commit to one of the two as the stronger candidate on this evidence. \
Do not hedge into "both are good". If the evidence genuinely does not separate them, \
say which single data point would decide it.
4. Frame it as a comparison of what the data shows, NOT as advice or an \
instruction to act. Say "screens better", "the stronger candidate on these \
numbers" — never "you should buy". Never predict prices or set targets.
5. Weigh valuation against growth and momentum together. A lower multiple is not \
automatically better if growth or margins are deteriorating — say why the cheaper \
one is cheap.
6. Write in {language}. Plain language for a non-expert reader. Be dense: the \
reader already sees the full comparison table on screen, so never just restate a \
row — explain what the difference means.

Output exactly this markdown structure (keep the headings in {language}):

## {h_pick}
Open with the ticker that screens stronger in bold, then 2-3 sentences on the \
single most important reason, cited. Example shape: "**{a}** screens stronger \
here, mainly because ...[{a}/F7]".

## {h_why}
3-4 bullets contrasting the two directly, each prefixed with the ticker that wins \
that dimension: "- **{a}** — cheaper on earnings at ... vs ... [{a}/F9][{b}/F9]". \
Cover valuation, growth/margins, and momentum. One bullet per dimension.

## {h_against}
2-3 bullets on the strongest case for the OTHER one, same citation style. This \
section must not be empty — if you cannot argue the other side, your pick is \
overconfident.

## {h_watch}
One sentence: the specific data point or event that would flip the conclusion."""

HEADINGS = {
    "en": {
        "h_pick": "The stronger candidate",
        "h_why": "Where it wins",
        "h_against": "The case for the other",
        "h_watch": "What would change this",
        "language": "English",
    },
    "es": {
        "h_pick": "El candidato más sólido",
        "h_why": "Dónde gana",
        "h_against": "El argumento a favor del otro",
        "h_watch": "Qué cambiaría esta conclusión",
        "language": "Spanish",
    },
}

RETRIEVAL_QUERY_TEMPLATE = (
    "Comparing {a} and {b} as investments right now: valuation multiples, "
    "earnings growth, profit margins, price momentum and trend, recent news "
    "risks and catalysts."
)


def retrieval_query(ticker_a: str, ticker_b: str) -> str:
    """The query embedded to retrieve context — one query, both tickers.

    Deliberately written as the comparison question itself rather than just the
    two symbols: the embedding then leans toward chunks about valuation, growth
    and momentum instead of whichever chunk merely mentions the ticker most.
    """
    return RETRIEVAL_QUERY_TEMPLATE.format(a=ticker_a, b=ticker_b)


def build_prompt(
    ticker_a: str, ticker_b: str, chunks: list[Chunk], lang: str
) -> tuple[str, str]:
    """Return (user_prompt, system_prompt) for the comparative verdict."""
    headings = HEADINGS.get(lang, HEADINGS["en"])
    system = SYSTEM_PROMPT.format(a=ticker_a, b=ticker_b, **headings)

    lines = [f"Compare {ticker_a} against {ticker_b}.", ""]
    for ticker in (ticker_a, ticker_b):
        selected = [c for c in chunks if c.ticker == ticker]
        lines.append(f"RETRIEVED EXCERPTS FOR {ticker}:")
        lines += [f"[{ticker}/{c.ref}] {c.text}" for c in selected] or [
            "(nothing indexed for this ticker yet)"
        ]
        lines.append("")
    lines.append("Write the comparison now.")
    return "\n".join(lines), system
