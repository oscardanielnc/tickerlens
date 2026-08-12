"""Postgres + pgvector connection pool and schema bootstrap.

The demo has no migration tool: the schema is one table, created idempotently
at startup. If this grows a second table with a real history, swap this for
Alembic rather than adding more CREATE IF NOT EXISTS calls.

Retrieval is a feature, not the app: every helper here tolerates the database
being absent so the analysis and comparison pages keep working without it.
"""

import logging

import asyncpg
from pgvector.asyncpg import register_vector

from app.core.config import get_settings
from app.core.embeddings import EMBED_DIM

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None

# ivfflat needs training data to help, and at demo scale (hundreds of rows) a
# sequential scan is faster than any index, so none is created. The unique
# constraint is what actually matters: re-analysing a ticker must update its
# documents in place instead of piling up duplicates.
_SCHEMA = f"""
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id          bigserial PRIMARY KEY,
    ticker      text        NOT NULL,
    kind        text        NOT NULL,
    ref         text        NOT NULL,
    text        text        NOT NULL,
    source_url  text,
    embedding   vector({EMBED_DIM}) NOT NULL,
    indexed_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticker, kind, ref)
);

CREATE INDEX IF NOT EXISTS documents_ticker_idx ON documents (ticker);
"""


def _dsn() -> str:
    """asyncpg speaks plain postgres:// — strip the SQLAlchemy driver suffix."""
    return get_settings().database_url.replace("postgresql+asyncpg://", "postgresql://")


async def _init_connection(connection: asyncpg.Connection) -> None:
    await register_vector(connection)


async def connect() -> None:
    """Open the pool and ensure the schema exists. Never raises."""
    global _pool
    if _pool is not None:
        return
    try:
        # register_vector() fails if the extension is missing, and the pool runs
        # it on every connection it opens — so the schema has to be created on a
        # bare connection before the pool exists, not from inside it.
        bootstrap = await asyncpg.connect(_dsn(), timeout=10)
        try:
            await bootstrap.execute(_SCHEMA)
        finally:
            await bootstrap.close()

        _pool = await asyncpg.create_pool(
            _dsn(), min_size=1, max_size=4, timeout=10, init=_init_connection
        )
        logger.info("Vector store ready (pgvector, %s dims)", EMBED_DIM)
    except Exception:
        logger.exception("Vector store unavailable — retrieval features are disabled")
        _pool = None


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def is_available() -> bool:
    return _pool is not None


def pool() -> asyncpg.Pool | None:
    return _pool
