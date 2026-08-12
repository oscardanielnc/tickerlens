"""Retrieval-augmented generation over the analyses the app has produced.

The corpus is not scraped prose: it is the numbered facts the analysis pipeline
already computes plus the news it collected, each carrying the citation ref and
source URL the UI uses. That is what makes the retrieved context quotable — a
chunk retrieved here can be cited as [F3] in the answer and still link back to
SEC EDGAR or the original article.

Flow: index_analysis() writes chunks at analysis time, retrieve_for_pair()
reads them back for a comparison, and the caller feeds those chunks to the LLM.
"""

import logging

from pydantic import BaseModel

from app.core import db
from app.core.embeddings import embed_passages, embed_query
from app.providers.base import NewsItem
from app.services.synthesis import Fact

logger = logging.getLogger(__name__)


class Chunk(BaseModel):
    """A retrieved document with the citation metadata the prompt and UI need."""

    ticker: str
    kind: str  # fact | news
    ref: str  # citation marker, e.g. F3 / N2
    text: str
    source_url: str | None = None
    distance: float  # cosine distance; 0 is identical


def _documents(ticker: str, facts: list[Fact], news: list[NewsItem]) -> list[tuple]:
    """Flatten an analysis into (kind, ref, text, source_url) rows to embed.

    The Fact list is the corpus, not the raw payload: build_facts() already emits
    both computed facts (F*) and news (N*) with the exact refs and URLs the UI
    cites, so indexing it keeps a retrieved chunk quotable. Indexing `news`
    separately would duplicate every headline under a second ref.

    Each fact is one self-contained statement, which is already the right chunk
    size — splitting further would strip the numbers from their subject. News
    facts carry only the headline, so the article summary is appended when
    available, truncated at 600 characters where market copy turns to
    boilerplate and starts diluting the embedding.
    """
    summaries = {f"N{i + 1}": item.summary for i, item in enumerate(news) if item.summary}

    rows: list[tuple] = []
    for fact in facts:
        kind = "news" if fact.ref.startswith("N") else "fact"
        text = f"{ticker}: {fact.text}"
        extra = summaries.get(fact.ref)
        if extra:
            text = f"{text} {extra}"
        rows.append((kind, fact.ref, text[:600], fact.source_url))
    return rows


async def index_analysis(ticker: str, facts: list[Fact], news: list[NewsItem]) -> int:
    """Embed and upsert one ticker's documents. Returns rows written, 0 if disabled."""
    pool = db.pool()
    if pool is None:
        return 0

    rows = _documents(ticker, facts, news)
    if not rows:
        return 0

    try:
        vectors = await embed_passages([text for _, _, text, _ in rows])
        records = [
            (ticker, kind, ref, text, source_url, vector)
            for (kind, ref, text, source_url), vector in zip(rows, vectors, strict=True)
        ]
        async with pool.acquire() as connection:
            await connection.executemany(
                """
                INSERT INTO documents (ticker, kind, ref, text, source_url, embedding)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (ticker, kind, ref) DO UPDATE
                   SET text = EXCLUDED.text,
                       source_url = EXCLUDED.source_url,
                       embedding = EXCLUDED.embedding,
                       indexed_at = now()
                """,
                records,
            )
        return len(records)
    except Exception:
        # Indexing is best-effort: a failure here must not break the analysis.
        logger.exception("Failed to index documents for %s", ticker)
        return 0


async def retrieve_for_pair(
    query: str, tickers: tuple[str, str], per_ticker: int = 6
) -> list[Chunk]:
    """Retrieve context for a comparison, symmetrically across both tickers.

    Plain top-k per ticker is not good enough here, and the failure is worse than
    thin context: it produces confident wrong answers. Retrieving NVDA and AMD
    independently returned AMD's valuation and margin facts but not NVDA's, and
    the model duly concluded AMD looked stronger "because NVDA has no comparable
    fundamentals" — while NVDA was in fact cheaper (P/E 34 vs 120) with a 71%
    net margin. The evidence was in the index; retrieval just never asked for it.

    So retrieval happens in two passes. The first finds which *dimensions* the
    query is about, as the union of the top-k refs across both tickers. The
    second fetches those refs for both sides. Because build_facts() emits facts
    in a fixed order, a ref denotes the same kind of fact for every ticker —
    F11 is the valuation line for both — so pulling the union guarantees that a
    dimension retrieved for one company is retrieved for the other, and the model
    compares like with like or is told the value is missing.
    """
    pool = db.pool()
    if pool is None:
        return []

    try:
        vector = await embed_query(query)
        async with pool.acquire() as connection:
            refs: set[str] = set()
            for ticker in tickers:
                rows = await connection.fetch(
                    """
                    SELECT ref
                      FROM documents
                     WHERE ticker = $2
                     ORDER BY embedding <=> $1
                     LIMIT $3
                    """,
                    vector,
                    ticker,
                    per_ticker,
                )
                refs.update(row["ref"] for row in rows)

            if not refs:
                return []

            rows = await connection.fetch(
                """
                SELECT ticker, kind, ref, text, source_url,
                       embedding <=> $1 AS distance
                  FROM documents
                 WHERE ticker = ANY($2) AND ref = ANY($3)
                 ORDER BY ticker, distance
                """,
                vector,
                list(tickers),
                list(refs),
            )
        return [
            Chunk(
                ticker=row["ticker"],
                kind=row["kind"],
                ref=row["ref"],
                text=row["text"],
                source_url=row["source_url"],
                distance=float(row["distance"]),
            )
            for row in rows
        ]
    except Exception:
        logger.exception("Retrieval failed for %s", tickers)
        return []


async def indexed_tickers() -> dict[str, int]:
    """Document count per ticker — surfaced on /api/health for observability."""
    pool = db.pool()
    if pool is None:
        return {}
    try:
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                "SELECT ticker, count(*) AS n FROM documents GROUP BY ticker ORDER BY ticker"
            )
        return {row["ticker"]: row["n"] for row in rows}
    except Exception:
        logger.exception("Failed to read index stats")
        return {}
