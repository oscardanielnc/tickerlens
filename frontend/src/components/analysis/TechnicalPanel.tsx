"use client";

import type { TechnicalSnapshot } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { SEMANTIC } from "@/lib/theme";

function Tile({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: "up" | "down" | null;
}) {
  const color =
    accent === "up" ? SEMANTIC.positive : accent === "down" ? SEMANTIC.negative : undefined;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 font-semibold text-zinc-100" style={color ? { color } : undefined}>
        {value}
      </div>
      {detail && <div className="text-xs text-zinc-500">{detail}</div>}
    </div>
  );
}

export function TechnicalPanel({ technical }: { technical: TechnicalSnapshot }) {
  const { t } = useLanguage();

  const trendLabel = {
    uptrend: t.trendUptrend,
    downtrend: t.trendDowntrend,
    sideways: t.trendSideways,
  }[technical.trend];
  const rsiLabel = {
    overbought: t.rsiOverbought,
    oversold: t.rsiOversold,
    neutral: t.rsiNeutral,
  }[technical.rsi_state];
  const volLabel = { high: t.volHigh, low: t.volLow, normal: t.volNormal }[
    technical.volume_state
  ];

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium text-zinc-300">{t.technicalTitle}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          label={t.trend}
          value={trendLabel}
          accent={
            technical.trend === "uptrend" ? "up" : technical.trend === "downtrend" ? "down" : null
          }
        />
        <Tile
          label="RSI (14)"
          value={technical.rsi14.toFixed(1)}
          detail={rsiLabel}
          accent={
            technical.rsi_state === "oversold"
              ? "up"
              : technical.rsi_state === "overbought"
                ? "down"
                : null
          }
        />
        <Tile
          label="MACD"
          value={technical.macd_state === "bullish" ? t.macdBullish : t.macdBearish}
          accent={technical.macd_state === "bullish" ? "up" : "down"}
        />
        <Tile
          label="EMA 20 / 50 / 200"
          value={`${technical.ema20.toFixed(0)} / ${technical.ema50.toFixed(0)} / ${technical.ema200?.toFixed(0) ?? "—"}`}
        />
        <Tile label={t.volume} value={volLabel} detail={`ATR ${technical.atr14.toFixed(2)}`} />
        <Tile
          label={t.from52wHigh}
          value={`${technical.distance_to_52w_high_pct.toFixed(1)}%`}
          detail={`${technical.low_52w.toFixed(0)} – ${technical.high_52w.toFixed(0)}`}
          accent={technical.distance_to_52w_high_pct > -5 ? "up" : null}
        />
        {technical.rs_vs_spy_3m !== null && (
          <Tile
            label={t.vsSpy}
            value={`${technical.rs_vs_spy_3m > 0 ? "+" : ""}${technical.rs_vs_spy_3m.toFixed(1)} pp`}
            accent={technical.rs_vs_spy_3m > 0 ? "up" : "down"}
          />
        )}
        <Tile
          label={t.trendTemplate}
          value={`${technical.trend_template.passed}/${technical.trend_template.checked}`}
          detail={t.trendTemplateHint}
          accent={technical.trend_template.passed >= 6 ? "up" : null}
        />
      </div>
    </section>
  );
}
