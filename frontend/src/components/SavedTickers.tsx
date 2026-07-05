"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { removeTicker, useSavedTickers } from "@/lib/storage";

const TREND_ICON = { uptrend: "📈", downtrend: "📉", sideways: "➡️" } as const;

/** Saved analyses (localStorage-only) with multi-select to open the compare view. */
export function SavedTickers() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const saved = useSavedTickers();
  const [selected, setSelected] = useState<string[]>([]);

  if (saved.length === 0) return null;

  const toggle = (ticker: string) =>
    setSelected((prev) =>
      prev.includes(ticker) ? prev.filter((s) => s !== ticker) : [...prev, ticker],
    );
  const canCompare = selected.length >= 2 && selected.length <= 4;

  return (
    <section className="w-full max-w-2xl text-left">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-foreground">{t.savedTitle}</h2>
        <span className="text-xs text-muted">{t.savedHint}</span>
        {saved.length >= 2 && (
          <button
            type="button"
            disabled={!canCompare}
            title={t.compareSelectHint}
            onClick={() => router.push(`/compare?t=${selected.join(",")}`)}
            className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⚖️ {t.compareCta}
            {selected.length > 0 ? ` (${selected.length})` : ""}
          </button>
        )}
      </div>
      {saved.length >= 2 && <p className="mb-2 text-xs text-muted">{t.compareSelectHint}</p>}

      <ul className="grid gap-2 sm:grid-cols-2">
        {saved.map((s) => (
          <li key={s.ticker} className="panel flex items-center gap-3 p-3">
            <input
              type="checkbox"
              aria-label={`${t.compareCta} ${s.ticker}`}
              checked={selected.includes(s.ticker)}
              onChange={() => toggle(s.ticker)}
              className="h-4 w-4 accent-[#5b8def]"
            />
            <Link href={`/t/${s.ticker}`} className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-semibold">{s.ticker}</span>
                <span className="truncate text-xs text-muted">{s.name}</span>
              </div>
              <div
                className="mt-0.5 text-xs text-muted"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {TREND_ICON[s.trend]} ${s.price.toFixed(2)} · {t.savedOn}{" "}
                {new Date(s.savedAt).toLocaleDateString(locale)}
              </div>
            </Link>
            <button
              type="button"
              title={t.removeLabel}
              aria-label={`${t.removeLabel} ${s.ticker}`}
              onClick={() => {
                removeTicker(s.ticker);
                setSelected((prev) => prev.filter((x) => x !== s.ticker));
              }}
              className="text-muted transition-colors hover:text-negative"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
