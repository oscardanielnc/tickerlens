"""Deterministic technical indicators.

Ported from the author's TradingView-compatible implementations
(EMA/RSI/ATR use `adjust=False` / Wilder's RMA to match TV values).
No AI here — these numbers are facts the AI layer may only cite.
"""

import numpy as np
import pandas as pd
from pydantic import BaseModel

from app.providers.base import Candle


def ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False).mean()


def rma(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(alpha=1 / length, adjust=False).mean()


def rsi(close: pd.Series, length: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    rs = rma(gain, length) / rma(loss, length).replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = ema(macd_line, signal)
    return macd_line, signal_line, macd_line - signal_line


def bollinger(close: pd.Series, length: int = 20, mult: float = 2.0):
    basis = close.rolling(length).mean()
    std = close.rolling(length).std(ddof=0)
    return basis + mult * std, basis, basis - mult * std


def atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    tr = pd.concat(
        [high - low, (high - close.shift()).abs(), (low - close.shift()).abs()], axis=1
    ).max(axis=1)
    return rma(tr, length)


class TrendTemplate(BaseModel):
    """Minervini's 8-condition Trend Template (stage-2 uptrend checklist)."""

    passed: int
    checked: int
    checks: dict[str, bool | None]


class TechnicalSnapshot(BaseModel):
    price: float
    change_percent_day: float
    ema20: float
    ema50: float
    ema150: float | None
    ema200: float | None
    rsi14: float
    rsi_state: str  # overbought | oversold | neutral
    macd_state: str  # bullish | bearish
    macd_cross: str  # bullish_cross | bearish_cross | none
    bollinger_upper: float
    bollinger_lower: float
    atr14: float
    trend: str  # uptrend | downtrend | sideways
    volume_state: str  # high | low | normal
    high_52w: float
    low_52w: float
    distance_to_52w_high_pct: float
    rs_vs_spy_3m: float | None
    trend_template: TrendTemplate


def candles_to_df(candles: list[Candle]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "ts": [c.ts for c in candles],
            "open": [c.open for c in candles],
            "high": [c.high for c in candles],
            "low": [c.low for c in candles],
            "close": [c.close for c in candles],
            "volume": [c.volume for c in candles],
        }
    ).set_index("ts")


def _relative_strength_vs_spy(close: pd.Series, spy_close: pd.Series | None) -> float | None:
    if spy_close is None or len(close) < 2 or len(spy_close) < 2:
        return None
    lookback = min(63, len(close) - 1, len(spy_close) - 1)
    ticker_return = close.iloc[-1] / close.iloc[-lookback - 1] - 1
    spy_return = spy_close.iloc[-1] / spy_close.iloc[-lookback - 1] - 1
    return round((ticker_return - spy_return) * 100, 2)


def compute_technical(
    candles: list[Candle], spy_candles: list[Candle] | None = None
) -> TechnicalSnapshot:
    df = candles_to_df(candles)
    close, high, low, vol = df["close"], df["high"], df["low"], df["volume"]
    bars = len(df)
    if bars < 60:
        raise ValueError(f"Not enough history to compute indicators ({bars} bars, need 60+)")

    ema20, ema50 = ema(close, 20), ema(close, 50)
    ema150 = ema(close, 150) if bars >= 150 else None
    ema200 = ema(close, 200) if bars >= 200 else None
    rsi14 = rsi(close)
    macd_line, signal_line, histogram = macd(close)
    bb_upper, _, bb_lower = bollinger(close)
    atr14 = atr(high, low, close)

    px = float(close.iloc[-1])
    px_prev = float(close.iloc[-2])
    e20, e50 = float(ema20.iloc[-1]), float(ema50.iloc[-1])
    e150 = float(ema150.iloc[-1]) if ema150 is not None else None
    e200 = float(ema200.iloc[-1]) if ema200 is not None else None
    r = float(rsi14.iloc[-1])
    mh, mh_prev = float(histogram.iloc[-1]), float(histogram.iloc[-2])

    high_52w = float(high.max())
    low_52w = float(low.min())
    dist_52w = round((px - high_52w) / high_52w * 100, 1)

    ema200_rising: bool | None = None
    if ema200 is not None and bars >= 221:
        ema200_rising = e200 > float(ema200.iloc[-21])

    spy_close = candles_to_df(spy_candles)["close"] if spy_candles else None
    rs_spy = _relative_strength_vs_spy(close, spy_close)

    checks: dict[str, bool | None] = {
        "price_above_ema50": px > e50,
        "price_above_ema150": px > e150 if e150 else None,
        "price_above_ema200": px > e200 if e200 else None,
        "ema50_above_ema150": e50 > e150 if e150 else None,
        "ema150_above_ema200": (e150 > e200) if (e150 and e200) else None,
        "ema200_rising": ema200_rising,
        "within_25pct_of_52w_high": dist_52w >= -25,
        "outperforming_spy_3m": rs_spy > 0 if rs_spy is not None else None,
    }

    vol_avg = float(vol.rolling(20).mean().iloc[-1])
    vol_cur = float(vol.iloc[-1])

    return TechnicalSnapshot(
        price=round(px, 4),
        change_percent_day=round((px - px_prev) / px_prev * 100, 2),
        ema20=round(e20, 2),
        ema50=round(e50, 2),
        ema150=round(e150, 2) if e150 else None,
        ema200=round(e200, 2) if e200 else None,
        rsi14=round(r, 1),
        rsi_state="overbought" if r > 70 else "oversold" if r < 30 else "neutral",
        macd_state=(
            "bullish" if float(macd_line.iloc[-1]) > float(signal_line.iloc[-1]) else "bearish"
        ),
        macd_cross=(
            "bullish_cross"
            if mh > 0 >= mh_prev
            else "bearish_cross"
            if mh < 0 <= mh_prev
            else "none"
        ),
        bollinger_upper=round(float(bb_upper.iloc[-1]), 2),
        bollinger_lower=round(float(bb_lower.iloc[-1]), 2),
        atr14=round(float(atr14.iloc[-1]), 2),
        trend=(
            "uptrend" if px > e20 > e50 else "downtrend" if px < e20 < e50 else "sideways"
        ),
        volume_state=(
            "high" if vol_cur > vol_avg * 1.3 else "low" if vol_cur < vol_avg * 0.7 else "normal"
        ),
        high_52w=round(high_52w, 2),
        low_52w=round(low_52w, 2),
        distance_to_52w_high_pct=dist_52w,
        rs_vs_spy_3m=rs_spy,
        trend_template=TrendTemplate(
            passed=sum(1 for v in checks.values() if v is True),
            checked=sum(1 for v in checks.values() if v is not None),
            checks=checks,
        ),
    )
