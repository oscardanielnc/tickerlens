"""Application settings loaded from environment variables (.env in dev)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "TickerLens"
    environment: str = "development"  # development | production
    cors_origins: list[str] = ["http://localhost:3000"]

    # Database
    database_url: str = "postgresql+asyncpg://tickerlens:tickerlens@localhost:5432/tickerlens"

    # Rate limiting (the public demo runs with the owner's API keys)
    rate_limit_analysis: str = "10/hour"  # full AI analysis per client IP
    rate_limit_data: str = "60/minute"  # plain data endpoints per client IP

    # Market data / news providers
    finnhub_api_key: str = ""
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    edgar_user_agent: str = "TickerLens (contact@example.com)"

    # AI engine (OpenAI-compatible endpoints: DeepSeek, GLM, etc.)
    ai_engine: str = "deepseek"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    # Named by role, not by "strong"/"cheap": the verdict has to weigh two
    # companies against each other and justify a pick, which is a harder job than
    # narrating one. Named models explicitly rather than the "deepseek-chat"
    # alias, so an upstream rename cannot silently swap the model under us.
    ai_model_verdict: str = "deepseek-v4-pro"  # comparative verdict
    ai_model_narrative: str = "deepseek-v4-flash"  # per-ticker narrative, fast streaming

    # RAG / retrieval
    embedding_model: str = "BAAI/bge-small-en-v1.5"  # 384 dims; see EMBED_DIM
    embedding_cache_dir: str = "/tmp/fastembed"
    rag_chunks_per_ticker: int = 6  # retrieval budget per side of a comparison

    # Cache freshness (seconds) — protects provider rate limits and AI spend
    cache_ttl_quote: int = 60
    cache_ttl_analysis: int = 900


@lru_cache
def get_settings() -> Settings:
    return Settings()
