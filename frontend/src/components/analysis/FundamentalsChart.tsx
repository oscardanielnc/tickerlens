"use client";

import { useState } from "react";

import type { Fundamentals } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { CHART } from "@/lib/theme";

const WIDTH = 900;
const HEIGHT = 300;
const PAD = { top: 20, right: 16, bottom: 28, left: 52 };

function formatB(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(value % 1e9 === 0 ? 0 : 1)}B`;
  return `${(value / 1e6).toFixed(0)}M`;
}

export function FundamentalsChart({ fundamentals }: { fundamentals: Fundamentals }) {
  const { t } = useLanguage();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const quarters = fundamentals.quarterly;
  if (quarters.length < 2) return null;

  const series = [
    { key: "revenue" as const, label: t.revenue, color: CHART.revenue },
    { key: "net_income" as const, label: t.netIncome, color: CHART.netIncome },
    { key: "operating_expenses" as const, label: t.opex, color: CHART.opex },
  ].filter((s) => quarters.some((q) => q[s.key] != null));

  const values = quarters.flatMap((q) => series.map((s) => q[s.key] ?? 0));
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const toY = (v: number) => PAD.top + plotH - ((v - minV) / (maxV - minV || 1)) * plotH;
  const zeroY = toY(0);

  const groupW = plotW / quarters.length;
  const barGap = 2; // surface gap between adjacent bars
  const barW = Math.min(22, (groupW - 16) / series.length - barGap);

  const hovered = hoverIdx !== null ? quarters[hoverIdx] : null;

  return (
    <figure className="panel p-4">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">{t.fundamentalsTitle}</span>
        <span className="flex items-center gap-3 text-xs text-muted">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          <a
            href={fundamentals.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted underline hover:text-foreground"
          >
            SEC EDGAR
          </a>
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="min-w-[600px] w-full"
          role="img"
          aria-label={t.fundamentalsTitle}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* y gridlines */}
          {[0.25, 0.5, 0.75, 1].map((f) => {
            const value = minV + (maxV - minV) * f;
            return (
              <g key={f}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={toY(value)}
                  y2={toY(value)}
                  stroke={CHART.grid}
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 6}
                  y={toY(value) + 4}
                  fontSize={11}
                  fill={CHART.muted}
                  textAnchor="end"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatB(value)}
                </text>
              </g>
            );
          })}
          {/* zero baseline */}
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={zeroY}
            y2={zeroY}
            stroke={CHART.axis}
            strokeWidth={1}
          />

          {quarters.map((q, qi) => {
            const groupX = PAD.left + qi * groupW + (groupW - series.length * (barW + barGap)) / 2;
            return (
              <g key={q.period}>
                {/* hover hit area per quarter group */}
                <rect
                  x={PAD.left + qi * groupW}
                  y={PAD.top}
                  width={groupW}
                  height={plotH}
                  fill={hoverIdx === qi ? "rgba(30,41,59,0.04)" : "transparent"}
                  onMouseEnter={() => setHoverIdx(qi)}
                />
                {series.map((s, si) => {
                  const value = q[s.key];
                  if (value == null) return null;
                  const y = toY(Math.max(0, value));
                  const height = Math.abs(toY(value) - zeroY);
                  return (
                    <rect
                      key={s.key}
                      x={groupX + si * (barW + barGap)}
                      y={value >= 0 ? y : zeroY}
                      width={barW}
                      height={Math.max(1, height)}
                      rx={3}
                      fill={s.color}
                      pointerEvents="none"
                    />
                  );
                })}
                <text
                  x={PAD.left + qi * groupW + groupW / 2}
                  y={HEIGHT - 8}
                  fontSize={10.5}
                  fill={CHART.muted}
                  textAnchor="middle"
                >
                  {q.period}
                </text>
              </g>
            );
          })}

          {/* tooltip */}
          {hovered && hoverIdx !== null && (
            <g pointerEvents="none">
              <g
                transform={`translate(${Math.min(
                  PAD.left + hoverIdx * groupW + groupW / 2 - 80,
                  WIDTH - 180,
                )}, ${PAD.top})`}
              >
                <rect
                  width={160}
                  height={16 + series.length * 15}
                  rx={6}
                  fill={CHART.tooltipBg}
                  stroke={CHART.axis}
                />
                <text x={10} y={14} fontSize={11} fontWeight={600} fill={CHART.tooltipText}>
                  {hovered.period}
                </text>
                {series.map((s, si) => (
                  <g key={s.key}>
                    <circle cx={14} cy={26 + si * 15} r={3} fill={s.color} />
                    <text
                      x={24}
                      y={30 + si * 15}
                      fontSize={11}
                      fill={CHART.tooltipMuted}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {s.label}: {hovered[s.key] != null ? `$${formatB(hovered[s.key]!)}` : "—"}
                    </text>
                  </g>
                ))}
              </g>
            </g>
          )}
        </svg>
      </div>
    </figure>
  );
}
