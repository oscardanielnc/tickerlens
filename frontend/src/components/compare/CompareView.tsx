"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { fetchAnalysis, type AnalysisPayload } from "@/lib/api";
import { formatMarketCap } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { SEMANTIC } from "@/lib/theme";
import { judges, type Verdict } from "@/lib/verdict";

interface LoadResult {
  ticker: string;
  data: AnalysisPayload | null;
}

const verdictColor = (v: Verdict) =>
  v === "good" ? SEMANTIC.positive : v === "bad" ? SEMANTIC.negative : undefined;

/** Cell for a valuation ratio: value colored by the shared traffic-light thresholds. */
function RatioCell({
  value,
  judgeFn,
  suffix = "",
}: {
  value: number | null | undefined;
  judgeFn: (v: number) => Verdict;
  suffix?: string;
}) {
  if (value == null) return <>—</>;
  const verdict = judgeFn(value);
  return (
    <span style={{ color: verdictColor(verdict), fontVariantNumeric: "tabular-nums" }}>
      {verdict === "good" ? "▲ " : verdict === "bad" ? "▼ " : ""}
      {value.toFixed(value >= 100 ? 0 : 2)}
      {suffix}
    </span>
  );
}

function SignCell({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value == null) return <>—</>;
  return (
    <span
      style={{
        color: value >= 0 ? SEMANTIC.positive : SEMANTIC.negative,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}
      {suffix}
    </span>
  );
}

export function CompareView({ tickers }: { tickers: string[] }) {
  const { t, locale } = useLanguage();
  const [results, setResults] = useState<LoadResult[] | null>(null);

  useEffect(() => {
    if (tickers.length < 2) return;
    let cancelled = false;
    Promise.all(
      tickers.map((ticker) =>
        fetchAnalysis(ticker)
          .then((data): LoadResult => ({ ticker, data }))
          .catch((): LoadResult => ({ ticker, data: null })),
      ),
    ).then((loaded) => !cancelled && setResults(loaded));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(",")]);

  const loaded = (results ?? []).filter((r): r is { ticker: string; data: AnalysisPayload } =>
    Boolean(r.data),
  );
  const failed = (results ?? []).filter((r) => !r.data);

  const trendLabel = {
    uptrend: t.trendUptrend,
    downtrend: t.trendDowntrend,
    sideways: t.trendSideways,
  } as const;
  const rsiLabel = {
    neutral: t.rsiNeutral,
    overbought: t.rsiOverbought,
    oversold: t.rsiOversold,
  } as const;
  const trendColor = {
    uptrend: SEMANTIC.positive,
    downtrend: SEMANTIC.negative,
    sideways: undefined,
  } as const;

  const rows: [string, (d: AnalysisPayload) => React.ReactNode][] = [
    [t.priceLabel, (d) => `$${d.quote.price.toFixed(2)}`],
    [t.dayChange, (d) => <SignCell key="dc" value={d.quote.change_percent} />],
    [t.marketCap, (d) => formatMarketCap(d.profile.market_cap)],
    [
      t.trend,
      (d) => <span style={{ color: trendColor[d.technical.trend] }}>{trendLabel[d.technical.trend]}</span>,
    ],
    ["RSI (14)", (d) => `${d.technical.rsi14.toFixed(0)} · ${rsiLabel[d.technical.rsi_state]}`],
    ["MACD", (d) => (d.technical.macd_state === "bullish" ? t.macdBullish : t.macdBearish)],
    [t.trendTemplate, (d) => `${d.technical.trend_template.passed}/${d.technical.trend_template.checked}`],
    [t.vsSpy, (d) => <SignCell key="spy" value={d.technical.rs_vs_spy_3m} />],
    [t.from52wHigh, (d) => `${d.technical.distance_to_52w_high_pct.toFixed(1)}%`],
    ["P/E", (d) => <RatioCell key="pe" value={d.valuation?.pe_ttm} judgeFn={judges.pe} />],
    ["PEG", (d) => <RatioCell key="peg" value={d.valuation?.peg_ttm} judgeFn={judges.peg} />],
    ["P/S", (d) => <RatioCell key="ps" value={d.valuation?.ps_ttm} judgeFn={judges.ps} />],
    ["EV/EBITDA", (d) => <RatioCell key="ev" value={d.valuation?.ev_ebitda_ttm} judgeFn={judges.evEbitda} />],
    ["P/B", (d) => <RatioCell key="pb" value={d.valuation?.pb} judgeFn={judges.pb} />],
    [t.divYield, (d) => <RatioCell key="dy" value={d.valuation?.dividend_yield_pct} judgeFn={judges.divYield} suffix="%" />],
    [t.roe, (d) => <RatioCell key="roe" value={d.valuation?.roe_pct} judgeFn={judges.roe} suffix="%" />],
    [t.netMargin, (d) => <RatioCell key="nm" value={d.valuation?.net_margin_pct} judgeFn={judges.margin} suffix="%" />],
    [t.revGrowth, (d) => <RatioCell key="rg" value={d.valuation?.revenue_growth_yoy_pct} judgeFn={judges.growth} suffix="%" />],
    [
      t.suggestedEntry,
      (d) => (d.levels.suggested_entry != null ? `$${d.levels.suggested_entry.toFixed(2)}` : "—"),
    ],
    [
      t.earningsTitle,
      (d) =>
        d.earnings.length > 0
          ? new Date(`${d.earnings[0].date}T12:00:00`).toLocaleDateString(locale)
          : "—",
    ],
  ];

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line bg-card px-6 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Ticker<span className="text-accent">Lens</span>
        </Link>
        <LanguageSwitch />
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">⚖️ {t.compareTitle}</h1>

        {tickers.length < 2 && (
          <div className="rounded-xl border border-[#f0dcb4] bg-[#fbf0d8] p-6 text-center">
            <p className="text-warning">{t.compareTooFew}</p>
            <Link href="/" className="mt-2 inline-block text-sm text-muted underline">
              {t.backToSearch}
            </Link>
          </div>
        )}

        {tickers.length >= 2 && !results && (
          <div className="flex flex-col items-center gap-3 py-24 text-muted">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
            {t.loading}
          </div>
        )}

        {failed.length > 0 && (
          <p className="text-sm text-warning">
            ⚠️ {t.compareFailed}: {failed.map((f) => f.ticker).join(", ")}
          </p>
        )}

        {results && loaded.length >= 1 && (
          <div className="panel overflow-x-auto p-4">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="py-2 pr-2 text-left font-medium text-muted"> </th>
                  {loaded.map(({ ticker, data }) => (
                    <th key={ticker} className="px-2 py-2 text-right">
                      <Link href={`/t/${ticker}`} className="hover:text-accent">
                        <span className="block font-mono font-semibold">{ticker}</span>
                        <span className="block max-w-36 truncate text-xs font-normal text-muted">
                          {data.profile.name}
                        </span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, render]) => (
                  <tr key={label} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2 text-muted">{label}</td>
                    {loaded.map(({ ticker, data }) => (
                      <td
                        key={ticker}
                        className="px-2 py-1.5 text-right"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {render(data)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted">
        <p className="mx-auto max-w-2xl">⚠️ {t.disclaimer}</p>
      </footer>
    </div>
  );
}
