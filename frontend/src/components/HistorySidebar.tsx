"use client";

import Link from "next/link";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { useState } from "react";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { HISTORY_LIMIT, removeTicker, useSavedTickers } from "@/lib/storage";

const TREND_ICON = { uptrend: "📈", downtrend: "📉", sideways: "➡️" } as const;

/** A comparison is head to head — exactly two tickers, never more. */
const COMPARE_SIZE = 2;

/**
 * Left rail with the last searches (localStorage only), shared by every route.
 * Two tickers can be picked from it to open the comparison view.
 * On narrow screens it collapses into a horizontal strip above the page.
 */
export function HistorySidebar() {
  const { t } = useLanguage();
  const router = useRouter();
  const history = useSavedTickers();
  const segments = useSelectedLayoutSegments();
  const current = segments[0] === "t" ? segments[1]?.toUpperCase() : undefined;
  const [selected, setSelected] = useState<string[]>([]);

  /** Picking a third ticker drops the oldest, so the pair is always the last two
   *  clicked — less annoying than refusing the click outright. */
  const toggle = (ticker: string) =>
    setSelected((prev) =>
      prev.includes(ticker)
        ? prev.filter((s) => s !== ticker)
        : [...prev, ticker].slice(-COMPARE_SIZE),
    );
  const canCompare = selected.length === COMPARE_SIZE;

  return (
    <aside className="shrink-0 border-b border-line bg-card md:sticky md:top-0 md:h-screen md:w-60 md:border-r md:border-b-0">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          {t.historyTitle}
        </h2>
        {history.length > 0 && (
          <span className="text-xs text-muted">
            {history.length}/{HISTORY_LIMIT}
          </span>
        )}
      </div>

      {history.length === 0 ? (
        <p className="px-4 pb-4 text-xs leading-relaxed text-muted">{t.historyEmpty}</p>
      ) : (
        <>
          <ul className="flex gap-2 overflow-x-auto px-3 pb-3 md:flex-col md:gap-1 md:overflow-visible">
            {history.map((s) => (
              <li
                key={s.ticker}
                className={`group flex min-w-44 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors md:min-w-0 ${
                  s.ticker === current ? "bg-soft" : "hover:bg-soft"
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`${t.compareCta} ${s.ticker}`}
                  checked={selected.includes(s.ticker)}
                  onChange={() => toggle(s.ticker)}
                  className="h-3.5 w-3.5 shrink-0 accent-[#5b8def]"
                />
                <Link href={`/t/${s.ticker}`} className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-semibold">
                    {s.ticker}
                  </span>
                  <span
                    className="block truncate text-xs text-muted"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {TREND_ICON[s.trend]} ${s.price.toFixed(2)}
                  </span>
                </Link>
                <button
                  type="button"
                  title={t.removeLabel}
                  aria-label={`${t.removeLabel} ${s.ticker}`}
                  onClick={() => {
                    removeTicker(s.ticker);
                    setSelected((prev) => prev.filter((x) => x !== s.ticker));
                  }}
                  className="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-negative focus:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          {history.length >= 2 && (
            <div className="px-3 pb-4">
              <button
                type="button"
                disabled={!canCompare}
                onClick={() => router.push(`/compare?t=${selected.join(",")}`)}
                className="w-full rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ⚖️ {t.compareCta}
                {selected.length > 0 ? ` (${selected.length}/${COMPARE_SIZE})` : ""}
              </button>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                {t.compareSelectHint}
              </p>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
