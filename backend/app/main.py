"""TickerLens API entrypoint."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routes import analysis, health
from app.core import db, embeddings
from app.core.config import get_settings
from app.core.rate_limit import limiter

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open the vector store and load the embedding model before serving.

    Both are best-effort: if Postgres is down or the model cannot be fetched,
    the app still serves analyses and only the retrieval features degrade.
    """
    await db.connect()
    # First load unpacks the ONNX weights, which takes seconds on one CPU — do it
    # in a thread so startup does not block, and off the first request's path.
    asyncio.create_task(asyncio.to_thread(_warm_embeddings))
    yield
    await db.disconnect()


def _warm_embeddings() -> None:
    try:
        embeddings.warm_up()
        logger.info("Embedding model ready")
    except Exception:
        logger.exception("Embedding model failed to load — retrieval is disabled")


app = FastAPI(
    title=settings.app_name,
    description="AI-assisted equity analysis with cited sources. Not financial advice.",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):  # noqa: ANN001
    from slowapi import _rate_limit_exceeded_handler

    return _rate_limit_exceeded_handler(request, exc)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
