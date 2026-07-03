"use client";

import type { LevelsResult } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

function StrengthDots({ strength }: { strength: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`strength ${strength}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < strength ? "bg-zinc-300" : "bg-zinc-700"}`}
        />
      ))}
    </span>
  );
}

export function LevelsPanel({ levels }: { levels: LevelsResult }) {
  const { t } = useLanguage();

  const rows = [
    ...levels.resistances
      .slice()
      .reverse()
      .map((level) => ({ level, color: "#e66767", label: t.resistanceLabel })),
    ...levels.supports.map((level) => ({ level, color: "#0ca30c", label: t.supportLabel })),
  ];

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium text-zinc-300">{t.levelsTitle}</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(({ level, color, label }) => (
            <tr key={`${level.kind}-${level.price}`} className="border-b border-zinc-800/60">
              <td className="py-1.5 pr-2">
                <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="text-zinc-400">{label}</span>
              </td>
              <td
                className="py-1.5 pr-2 text-right font-semibold text-zinc-100"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                ${level.price.toFixed(2)}
              </td>
              <td
                className="py-1.5 pr-2 text-right text-zinc-500"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {level.distance_percent > 0 ? "+" : ""}
                {level.distance_percent.toFixed(1)}%
              </td>
              <td className="py-1.5 text-right">
                <StrengthDots strength={level.strength} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {levels.suggested_entry !== null && (
        <div className="mt-3 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-emerald-500">
            {t.suggestedEntry}
          </div>
          <div
            className="font-semibold text-emerald-300"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            ${levels.suggested_entry.toFixed(2)}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{t.suggestedEntryHint}</div>
        </div>
      )}
    </section>
  );
}
