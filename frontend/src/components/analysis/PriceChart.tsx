"use client";

import { useMemo, useRef, useState } from "react";

import type { Candle, Level } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { CHART } from "@/lib/theme";

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
  const [selected, setSelected] = useState<Level | null>(null);

  const { points, priceToY, indexToX, minPrice, maxPrice, yTicks } = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const levelPrices = [...supports, ...resistances].map((level) => level.price);
    const lo = Math.min(...closes, ...levelPrices) * 0.99;
    const hi = Math.max(...closes, ...levelPrices) * 1.01;
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const toY = (p: number) => PAD.top + plotH - ((p - lo) / (hi - lo)) * plotH;
    const toX = (i: number) => PAD.left + (i / Math.max(1, candles.length - 1)) * plotW;
    const tickCount = 4;
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
    ...supports.map((level) => ({ level, color: CHART.support, label: t.supportLabel })),
    ...resistances.map((level) => ({ level, color: CHART.resistance, label: t.resistanceLabel })),
  ].filter(({ level }) => level.price >= minPrice && level.price <= maxPrice);

  const dateLabel = (ts: string) =>
    new Date(ts).toLocaleDateString(locale === "es" ? "es-PE" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const selectedMeta = selected
    ? levelLines.find(({ level }) => level === selected)
    : null;

  return (
    <figure className="panel p-4">
      <figcaption className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{t.priceChartTitle}</span>
        <span className="text-xs text-muted">{t.chartClickHint}</span>
      </figcaption>
      <div className="relative overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="min-w-[600px] w-full"
          role="img"
          aria-label={t.priceChartTitle}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          onClick={() => setSelected(null)}
        >
          {/* gridlines + y labels */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={priceToY(tick)}
                y2={priceToY(tick)}
                stroke={CHART.grid}
                strokeWidth={1}
              />
              <text
                x={WIDTH - PAD.right + 6}
                y={priceToY(tick) + 4}
                fontSize={11}
                fill={CHART.muted}
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
            stroke={CHART.axis}
            strokeWidth={1}
          />

          {/* price area + line */}
          <path d={areaPath} fill={CHART.priceFill} />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={CHART.price}
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* support / resistance lines — clean; click one to inspect */}
          {levelLines.map(({ level, color }) => {
            const y = priceToY(level.price);
            const isSelected = selected === level;
            return (
              <g key={`${level.kind}-${level.price}`}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={y}
                  y2={y}
                  stroke={color}
                  strokeWidth={isSelected ? 2 : 1.25}
                  strokeDasharray={isSelected ? undefined : "6 5"}
                  opacity={isSelected ? 1 : 0.55}
                />
                {/* invisible wide hit area for easy clicking */}
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={y}
                  y2={y}
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(isSelected ? null : level);
                  }}
                />
              </g>
            );
          })}

          {/* selected level info card */}
          {selected && selectedMeta && (
            <g pointerEvents="none">
              <g
                transform={`translate(${WIDTH - PAD.right - 200}, ${Math.max(
                  PAD.top,
                  Math.min(priceToY(selected.price) - 52, HEIGHT - PAD.bottom - 48),
                )})`}
              >
                <rect width={192} height={44} rx={6} fill={CHART.tooltipBg} stroke={CHART.axis} />
                <circle cx={12} cy={15} r={3.5} fill={selectedMeta.color} />
                <text x={22} y={19} fontSize={12} fontWeight={600} fill={CHART.tooltipText}>
                  {selectedMeta.label} ${selected.price.toFixed(2)}
                </text>
                <text x={22} y={34} fontSize={11} fill={CHART.tooltipMuted}>
                  {selected.distance_percent > 0 ? "+" : ""}
                  {selected.distance_percent.toFixed(1)}% · {t.strength}{" "}
                  {selected.strength}/5
                </text>
              </g>
            </g>
          )}

          {/* crosshair + price tooltip */}
          {hovered && hoverIndex !== null && !selected && (
            <g pointerEvents="none">
              <line
                x1={indexToX(hoverIndex)}
                x2={indexToX(hoverIndex)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke={CHART.crosshair}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={indexToX(hoverIndex)}
                cy={priceToY(hovered.close)}
                r={4.5}
                fill={CHART.price}
                stroke={CHART.tooltipBg}
                strokeWidth={2}
              />
              <g
                transform={`translate(${Math.min(indexToX(hoverIndex) + 10, WIDTH - 190)}, ${PAD.top + 6})`}
              >
                <rect width={170} height={40} rx={6} fill={CHART.tooltipBg} stroke={CHART.axis} />
                <text x={10} y={17} fontSize={11} fill={CHART.tooltipMuted}>
                  {dateLabel(hovered.ts)}
                </text>
                <text
                  x={10}
                  y={32}
                  fontSize={12}
                  fontWeight={600}
                  fill={CHART.tooltipText}
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
