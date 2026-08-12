"""Text embeddings for the RAG index.

Runs the model in-process via fastembed (ONNX runtime, no torch) so the demo
has no second API key and anyone cloning the repo can use retrieval offline.
`bge-small-en-v1.5` is 384-dimensional and ~130MB on disk, which fits the
demo VM; the dimension is mirrored in the pgvector column, so changing the
model means changing EMBED_DIM and reindexing.

BGE models are asymmetric: passages are embedded bare, queries need an
instruction prefix. Skipping that prefix measurably degrades retrieval, so
`embed_query` and `embed_passages` are separate entry points on purpose.
"""

import asyncio
from functools import lru_cache

from app.core.config import get_settings

EMBED_DIM = 384

# Prescribed by the model card; the encoder was trained with this exact string.
_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


@lru_cache
def _model():
    """Load the ONNX model once per process (first call downloads the weights)."""
    from fastembed import TextEmbedding

    settings = get_settings()
    return TextEmbedding(
        model_name=settings.embedding_model,
        cache_dir=settings.embedding_cache_dir,
    )


def _encode(texts: list[str]) -> list[list[float]]:
    return [vector.tolist() for vector in _model().embed(texts)]


async def embed_passages(texts: list[str]) -> list[list[float]]:
    """Embed documents for storage. Inference is CPU-bound, so keep it off the loop."""
    if not texts:
        return []
    return await asyncio.to_thread(_encode, texts)


async def embed_query(text: str) -> list[float]:
    """Embed a search query, with the instruction prefix BGE expects."""
    vectors = await asyncio.to_thread(_encode, [_QUERY_PREFIX + text])
    return vectors[0]


def warm_up() -> None:
    """Load the model ahead of the first request so it does not pay the cost."""
    _model()
