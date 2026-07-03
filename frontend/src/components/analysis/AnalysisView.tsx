"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AiNarrative } from "@/components/analysis/AiNarrative";
import { EarningsCard } from "@/components/analysis/EarningsCard";
import { LevelsPanel } from "@/components/analysis/LevelsPanel";
import { NewsList } from "@/components/analysis/NewsList";
import { PriceChart } from "@/components/analysis/PriceChart";
import { TechnicalPanel } from "@/components/analysis/TechnicalPanel";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ApiError, fetchAnalysis, type AnalysisPayload } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

function formatMarketCap(value: number | null): string {
  if (!value) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
}

export function AnalysisView({ ticker }: { ticker: string }) {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAnalysis(ticker)
      .then((payload) => !cancelled && setData(payload))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setError(t.errorNotFound);
        else if (err instanceof ApiError && err.status === 429) setError(t.errorRateLimit);
        else setError(t.errorGeneric);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-4 border-b border-zinc-800 px-6 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Ticker<span className="text-emerald-400">Lens</span>
        </Link>
        <form
          className="flex flex-1 justify-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (search.trim()) router.push(`/t/${search.trim().toUpperCase()}`);
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
            placeholder={t.searchPlaceholder}
            className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none"
            maxLength={6}
          />
        </form>
        <LanguageSwitch />
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {error && (
          <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-6 text-center">
            <p className="text-amber-300">{error}</p>
            <Link href="/" className="mt-2 inline-block text-sm text-zinc-400 underline">
              {t.backToSearch}
            </Link>
          </div>
        )}

        {!data && !error && (
          <div className="flex flex-col items-center gap-3 py-24 text-zinc-500">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
            {t.loading}
          </div>
        )}

        {data && (
          <>
            {/* Quote header */}
            <section className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-2xl font-bold">{data.profile.name}</h1>
              <span className="font-mono text-zinc-500">{data.ticker}</span>
              <span
                className="text-2xl font-semibold"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                ${data.quote.price.toFixed(2)}
              </span>
              <span
                className={`font-semibold ${
                  data.quote.change_percent >= 0 ? "text-[#0ca30c]" : "text-[#e66767]"
                }`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {data.quote.change_percent >= 0 ? "+" : ""}
                {data.quote.change_percent.toFixed(2)}%
              </span>
              <span className="text-xs text-zinc-500">
                {t.marketCap} {formatMarketCap(data.profile.market_cap)} · {t.exchange}{" "}
                {data.profile.exchange ?? "—"}
                {data.profile.website && (
                  <>
                    {" · "}
                    <a
                      href={data.profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-zinc-300"
                    >
                      {t.website}
                    </a>
                  </>
                )}
              </span>
            </section>

            <PriceChart
              candles={data.candles}
              supports={data.levels.supports}
              resistances={data.levels.resistances}
            />

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <AiNarrative key={locale} ticker={data.ticker} facts={data.facts} />
                <TechnicalPanel technical={data.technical} />
              </div>
              <div className="space-y-4">
                <LevelsPanel levels={data.levels} />
                <EarningsCard earnings={data.earnings} />
                <NewsList news={data.news} />
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="px-6 py-4 text-center text-xs text-zinc-500">
        <p className="mx-auto max-w-2xl">⚠️ {t.disclaimer}</p>
      </footer>
    </div>
  );
}
