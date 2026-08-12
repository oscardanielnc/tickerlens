"""Support / resistance levels — pure computation, zero AI.

Method (simplified port of the author's dip_levels engine):
1. Collect candidate levels: swing lows/highs (fractals, k=3 and k=7),
   moving averages, Bollinger lower band, Fibonacci retracements of the
   52-week range, round numbers near price, and 52-week extremes.
2. Cluster candidates that sit within 0.5 * ATR of each other.
3. Score each cluster 1-5 by confluence (how many independent methods
   agree) and touches (how often price reacted there).
Levels below price are supports; above are resistances.
"""

from pydantic import BaseModel

from app.providers.base import Candle
from app.services.technical import atr, candles_to_df, ema


class Level(BaseModel):
    price: float
    kind: str  # support | resistance
    strength: int  # 1-5
    distance_percent: float  # signed distance from current price
    methods: list[str]  # which detection methods contributed
    touches: int


class LevelsResult(BaseModel):
    supports: list[Level]
    resistances: list[Level]
    nearest_support: Level | None
    nearest_resistance: Level | None
    suggested_entry: float | None  # nearest strong support (strength >= 3)


def _swing_points(series: list[float], k: int, find_low: bool) -> list[float]:
    points = []
    for i in range(k, len(series) - k):
        window = series[i - k : i + k + 1]
        center = series[i]
        if find_low and center == min(window):
            points.append(center)
        elif not find_low and center == max(window):
            points.append(center)
    return points


def _round_numbers(price: float) -> list[float]:
    step = 10 ** max(0, len(str(int(price))) - 2)  # e.g. $194 -> step 10, $1900 -> 100
    base = int(price / step) * step
    return [float(base + i * step) for i in range(-3, 4) if base + i * step > 0]


def _fibonacci(low: float, high: float) -> dict[str, float]:
    span = high - low
    return {
        "fib_0.382": high - 0.382 * span,
        "fib_0.5": high - 0.5 * span,
        "fib_0.618": high - 0.618 * span,
    }


def compute_levels(candles: list[Candle], max_per_side: int = 4) -> LevelsResult:
    df = candles_to_df(candles)
    close, high, low = df["close"], df["high"], df["low"]
    px = float(close.iloc[-1])
    atr_now = float(atr(high, low, close).iloc[-1])
    cluster_width = max(atr_now * 0.5, px * 0.002)

    lows = low.tolist()
    highs = high.tolist()
    high_52w, low_52w = float(high.max()), float(low.min())

    candidates: list[tuple[float, str]] = []
    for k, tag in ((3, "swing_minor"), (7, "swing_major")):
        candidates += [(p, f"{tag}_low") for p in _swing_points(lows, k, find_low=True)]
        candidates += [(p, f"{tag}_high") for p in _swing_points(highs, k, find_low=False)]
    candidates += [(float(ema(close, 20).iloc[-1]), "ema20")]
    if len(close) >= 50:
        candidates += [(float(ema(close, 50).iloc[-1]), "ema50")]
    if len(close) >= 200:
        candidates += [(float(close.rolling(200).mean().iloc[-1]), "sma200")]
    candidates += [
        (high_52w, "52w_high"),
        (low_52w, "52w_low"),
    ]
    candidates += [(p, name) for name, p in _fibonacci(low_52w, high_52w).items()]
    candidates += [(p, "round_number") for p in _round_numbers(px)]
    candidates = [(p, m) for p, m in candidates if m != "_skip" and p > 0]

    # Cluster by proximity. Anchor each cluster to its first (lowest) price so
    # clusters can't chain transitively into one span covering half the chart.
    candidates.sort(key=lambda c: c[0])
    clusters: list[dict] = []
    for price, method in candidates:
        if clusters and price - clusters[-1]["prices"][0] <= cluster_width:
            clusters[-1]["prices"].append(price)
            clusters[-1]["methods"].add(method)
        else:
            clusters.append({"prices": [price], "methods": {method}})

    levels: list[Level] = []
    for cluster in clusters:
        level_price = sum(cluster["prices"]) / len(cluster["prices"])
        if abs(level_price - px) / px < 0.005:  # too close to spot to be actionable
            continue
        touches = int(((low - level_price).abs() <= cluster_width).sum())
        confluence = len({m.split("_low")[0].split("_high")[0] for m in cluster["methods"]})
        strength = min(5, max(1, confluence + (1 if touches >= 3 else 0)))
        levels.append(
            Level(
                price=round(level_price, 2),
                kind="support" if level_price < px else "resistance",
                strength=strength,
                distance_percent=round((level_price - px) / px * 100, 2),
                methods=sorted(cluster["methods"]),
                touches=touches,
            )
        )

    supports = sorted(
        [level for level in levels if level.kind == "support"],
        key=lambda level: -level.price,
    )[:max_per_side]
    resistances = sorted(
        [level for level in levels if level.kind == "resistance"],
        key=lambda level: level.price,
    )[:max_per_side]

    strong_supports = [level for level in supports if level.strength >= 3]
    return LevelsResult(
        supports=supports,
        resistances=resistances,
        nearest_support=supports[0] if supports else None,
        nearest_resistance=resistances[0] if resistances else None,
        suggested_entry=strong_supports[0].price if strong_supports else None,
    )
