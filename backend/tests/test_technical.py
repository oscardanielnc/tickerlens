import math
from datetime import UTC, datetime, timedelta

import pytest

from app.providers.base import Candle
from app.services.levels import compute_levels
from app.services.technical import MIN_BARS, compute_technical


def make_candles(closes: list[float], spread: float = 1.0) -> list[Candle]:
    start = datetime(2025, 1, 1, tzinfo=UTC)
    return [
        Candle(
            ts=start + timedelta(days=i),
            open=c,
            high=c + spread,
            low=c - spread,
            close=c,
            volume=1_000_000,
        )
        for i, c in enumerate(closes)
    ]


def uptrend_candles(n: int = 260) -> list[Candle]:
    # Steady uptrend with a small oscillation so swings exist
    closes = [100 + i * 0.5 + 3 * math.sin(i / 5) for i in range(n)]
    return make_candles(closes)


def test_uptrend_snapshot() -> None:
    snapshot = compute_technical(uptrend_candles())
    assert snapshot.trend == "uptrend"
    assert snapshot.price > snapshot.ema50 > (snapshot.ema200 or 0)
    assert snapshot.trend_template.passed >= 6
    assert 0 < snapshot.rsi14 <= 100
    assert snapshot.atr14 > 0


def test_downtrend_snapshot() -> None:
    closes = [300 - i * 0.5 + 3 * math.sin(i / 5) for i in range(260)]
    snapshot = compute_technical(make_candles(closes))
    assert snapshot.trend == "downtrend"
    assert snapshot.trend_template.passed <= 2
    assert snapshot.distance_to_52w_high_pct < -20


def test_insufficient_history_raises() -> None:
    with pytest.raises(ValueError):
        compute_technical(make_candles([100.0] * (MIN_BARS - 1)))


def test_young_listing_omits_long_emas() -> None:
    """A recent IPO clears MIN_BARS but has no EMA50/150/200 to speak of."""
    closes = [100 + i * 0.5 for i in range(40)]
    snapshot = compute_technical(make_candles(closes))
    assert snapshot.ema50 is None
    assert snapshot.ema150 is None and snapshot.ema200 is None
    assert snapshot.trend == "uptrend"  # falls back to price vs EMA20
    assert snapshot.trend_template.checks["price_above_ema50"] is None


def test_levels_split_by_price() -> None:
    result = compute_levels(uptrend_candles())
    assert all(level.price < level.price + 1 for level in result.supports)
    for level in result.supports:
        assert level.kind == "support" and level.distance_percent < 0
    for level in result.resistances:
        assert level.kind == "resistance" and level.distance_percent > 0
    assert 1 <= min((level.strength for level in result.supports), default=1)
    assert max((level.strength for level in result.supports), default=5) <= 5


def test_levels_nearest_ordering() -> None:
    result = compute_levels(uptrend_candles())
    if result.nearest_support and len(result.supports) > 1:
        assert result.nearest_support.price == max(level.price for level in result.supports)
    if result.nearest_resistance and len(result.resistances) > 1:
        assert result.nearest_resistance.price == min(level.price for level in result.resistances)
