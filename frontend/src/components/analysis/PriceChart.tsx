"use client";

import { useMemo, useRef, useState } from "react";

import type { Candle, Level } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// Chart chrome tokens (dark surface) from the validated reference palette
const INK = {
  price: "#3987e5",
  priceFill: "rgba(57, 135, 229, 0.12)",
  support: "#0ca30c",
  resistance: "#d03b3b",
  grid: "#2c2c2a",
  axis: "#383835",
  muted: "#898781",
  crosshair: "#c3c2b7",
};

const WIDTH = 900;
const HEIGHT = 360;
const PAD = { top: 16, right: 64, bottom: 24, left: 8 };

interface Props {
  candles: Candle[];
  supports: Level[];
  resistances: Level[];
}

export function PriceChart({ candles, supports, resistances }: Props) {
  const { t, locale } = useLanguage();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, priceToY, indexToX, minPrice, maxPrice, yTicks } = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const levelPrices = [...supports, ...resistances].map((level) => level.price);
    const lo = Math.min(...closes, ...levelPrices) * 0.99;
    const hi = Math.max(...closes, ...levelPrices) * 1.01;
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const toY = (p: number) => PAD.top + plotH - ((p - lo) / (hi - lo)) * plotH;
    const toX = (i: number) => PAD.left + (i / Math.max(1, candles.length - 1)) * plotW;
    const tickCount = 5;
    const ticks = Array.from(
      { length: tickCount },
      (_, i) => lo + ((hi - lo) * (i + 0.5)) / tickCount,
    );
    return {
      points: closes.map((c, i) => `${toX(i).toFixed(1)},${toY(c).toFixed(1)}`),
      priceToY: toY,
      indexToX: toX,
      minPrice: lo,
      maxPrice: hi,
      yTicks: ticks,
    };
  }, [candles, supports, resistances]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (x - PAD.left) / (WIDTH - PAD.left - PAD.right);
    const index = Math.round(ratio * (candles.length - 1));
    setHoverIndex(index >= 0 && index < candles.length ? index : null);
  };

  const hovered = hoverIndex !== null ? candles[hoverIndex] : null;
  const areaPath =
    `M ${points[0]} L ${points.join(" L ")} ` +
    `L ${indexToX(candles.length - 1)},${HEIGHT - PAD.bottom} L ${indexToX(0)},${HEIGHT - PAD.bottom} Z`;

  const levelLines = [
    ...supports.map((level) => ({ level, color: INK.support, label: t.supportLabel })),
    ...resistances.map((level) => ({ level, color: INK.resistance, label: t.resistanceLabel })),
  ].filter(({ level }) => level.price >= minPrice && level.price <= maxPrice);

  const dateLabel = (ts: string) =>
    new Date(ts).toLocaleDateString(locale === "es" ? "es-PE" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <figure className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <figcaption className="mb-2 text-sm font-medium text-zinc-300">
        {t.priceChartTitle}
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="min-w-[600px] w-full"
          role="img"
          aria-label={t.priceChartTitle}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* gridlines + y labels */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={priceToY(tick)}
                y2={priceToY(tick)}
                stroke={INK.grid}
                strokeWidth={1}
              />
              <text
                x={WIDTH - PAD.right + 6}
                y={priceToY(tick) + 4}
                fontSize={11}
                fill={INK.muted}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {tick.toFixed(0)}
              </text>
            </g>
          ))}
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={HEIGHT - PAD.bottom}
            y2={HEIGHT - PAD.bottom}
            stroke={INK.axis}
            strokeWidth={1}
          />

          {/* price area + line */}
          <path d={areaPath} fill={INK.priceFill} />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={INK.price}
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* support / resistance overlays — dashed, always text-labeled */}
          {levelLines.map(({ level, color, label }) => (
            <g key={`${level.kind}-${level.price}`}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={priceToY(level.price)}
                y2={priceToY(level.price)}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="6 5"
                opacity={0.3 + level.strength * 0.14}
              />
              <text
                x={PAD.left + 4}
                y={priceToY(level.price) - 4}
                fontSize={10.5}
                fill={color}
              >
                {label} {level.price.toFixed(2)} · {level.strength}/5
              </text>
            </g>
          ))}

          {/* crosshair + tooltip */}
          {hovered && hoverIndex !== null && (
            <g pointerEvents="none">
              <line
                x1={indexToX(hoverIndex)}
                x2={indexToX(hoverIndex)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke={INK.crosshair}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={indexToX(hoverIndex)}
                cy={priceToY(hovered.close)}
                r={4.5}
                fill={INK.price}
                stroke="#1a1a19"
                strokeWidth={2}
              />
              <g
                transform={`translate(${Math.min(indexToX(hoverIndex) + 10, WIDTH - 190)}, ${PAD.top + 6})`}
              >
                <rect width={170} height={40} rx={6} fill="#0d0d0d" stroke={INK.axis} />
                <text x={10} y={17} fontSize={11} fill="#c3c2b7">
                  {dateLabel(hovered.ts)}
                </text>
                <text
                  x={10}
                  y={32}
                  fontSize={12}
                  fontWeight={600}
                  fill="#ffffff"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  ${hovered.close.toFixed(2)}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
    </figure>
  );
}
