from fastapi import APIRouter

from app.core import db
from app.core.config import get_settings
from app.services import rag

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    settings = get_settings()
    indexed = await rag.indexed_tickers()
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        # Retrieval is optional, so report it rather than failing the check:
        # "ok" with retrieval down still serves analyses.
        "retrieval": {
            "vector_store": db.is_available(),
            "indexed_tickers": len(indexed),
            "indexed_documents": sum(indexed.values()),
        },
    }
