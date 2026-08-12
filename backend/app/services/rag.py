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
    """Top-k chunks for `query`, retrieved per ticker rather than globally.

    A single global top-k would happily return 12 chunks about the more heavily
    covered company and none about the other, which is useless for a comparison:
    the prompt needs evidence on both sides. So the budget is split per ticker.
    """
    pool = db.pool()
    if pool is None:
        return []

    try:
        vector = await embed_query(query)
        chunks: list[Chunk] = []
        async with pool.acquire() as connection:
            for ticker in tickers:
                rows = await connection.fetch(
                    """
                    SELECT ticker, kind, ref, text, source_url,
                           embedding <=> $1 AS distance
                      FROM documents
                     WHERE ticker = $2
                     ORDER BY distance
                     LIMIT $3
                    """,
                    vector,
                    ticker,
                    per_ticker,
                )
                chunks += [
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
        return chunks
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
