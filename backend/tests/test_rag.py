"""Unit tests for the RAG chunking and prompt assembly.

These cover the pure logic — what gets indexed and what the model is shown.
The pgvector round trip needs a real database and is exercised against the
deployed stack instead.
"""

from datetime import UTC, datetime

from app.providers.base import NewsItem
from app.services import verdict
from app.services.rag import Chunk, _documents
from app.services.synthesis import Fact


def make_news(headline: str, summary: str | None) -> NewsItem:
    return NewsItem(
        headline=headline,
        summary=summary,
        published_at=datetime(2026, 8, 12, tzinfo=UTC),
        source_name="Reuters",
        source_url="https://example.com/article",
        tickers=["NVDA"],
    )


def test_documents_split_facts_from_news_by_ref() -> None:
    facts = [
        Fact(ref="F1", text="Trades on NASDAQ.", source_url="https://a"),
        Fact(ref="N1", text="[Reuters, 2026-08-12] Chip demand rises", source_url="https://b"),
    ]
    rows = _documents("NVDA", facts, [make_news("Chip demand rises", None)])

    kinds = {ref: kind for kind, ref, _, _ in rows}
    assert kinds == {"F1": "fact", "N1": "news"}


def test_documents_prefix_ticker_so_chunks_stand_alone() -> None:
    """A retrieved chunk is shown without its row context, so it must name the company."""
    rows = _documents("NVDA", [Fact(ref="F1", text="P/E is 45.")], [])
    _, _, text, _ = rows[0]
    assert text.startswith("NVDA: ")


def test_documents_append_news_summary_for_retrieval_signal() -> None:
    facts = [Fact(ref="N1", text="[Reuters] Chip demand rises")]
    news = [make_news("Chip demand rises", "Data centre orders grew 40% in the quarter.")]
    _, _, text, _ = _documents("NVDA", facts, news)[0]
    assert "Data centre orders grew 40%" in text


def test_documents_truncate_long_text() -> None:
    facts = [Fact(ref="N1", text="headline")]
    news = [make_news("headline", "x" * 5000)]
    rows = _documents("NVDA", facts, news)
    assert len(rows[0][2]) <= 600


def test_documents_keep_source_url_for_citation() -> None:
    facts = [Fact(ref="F1", text="Revenue grew.", source_url="https://sec.gov/filing")]
    assert _documents("NVDA", facts, [])[0][3] == "https://sec.gov/filing"


def test_retrieval_query_mentions_both_tickers_and_the_dimensions() -> None:
    query = verdict.retrieval_query("NVDA", "AMD")
    assert "NVDA" in query and "AMD" in query
    # The query has to pull valuation/growth/momentum chunks, not just name matches.
    assert "valuation" in query and "momentum" in query


def _chunk(ticker: str, ref: str, text: str) -> Chunk:
    return Chunk(ticker=ticker, kind="fact", ref=ref, text=text, distance=0.1)


def test_verdict_prompt_groups_excerpts_per_ticker_with_prefixed_refs() -> None:
    chunks = [
        _chunk("NVDA", "F1", "NVDA: P/E is 45."),
        _chunk("AMD", "F1", "AMD: P/E is 30."),
    ]
    prompt, system = verdict.build_prompt("NVDA", "AMD", chunks, "en")

    assert "RETRIEVED EXCERPTS FOR NVDA:" in prompt
    assert "RETRIEVED EXCERPTS FOR AMD:" in prompt
    # Both companies number facts from F1, so refs must be disambiguated.
    assert "[NVDA/F1]" in prompt and "[AMD/F1]" in prompt
    assert "English" in system


def test_verdict_prompt_flags_a_ticker_with_no_retrieved_context() -> None:
    chunks = [_chunk("NVDA", "F1", "NVDA: P/E is 45.")]
    prompt, _ = verdict.build_prompt("NVDA", "AMD", chunks, "en")
    assert "(nothing indexed for this ticker yet)" in prompt


def test_verdict_prompt_localises_headings() -> None:
    _, system = verdict.build_prompt("NVDA", "AMD", [], "es")
    assert "El candidato más sólido" in system
    assert "Spanish" in system


def test_verdict_prompt_forbids_advice_framing() -> None:
    """The app's stance: it may pick a side, but never phrase it as advice."""
    _, system = verdict.build_prompt("NVDA", "AMD", [], "en")
    assert "never" in system.lower() and "you should buy" in system
