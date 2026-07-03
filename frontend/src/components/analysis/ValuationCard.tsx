"use client";

import type { ValuationMetrics } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

function fmt(value: number | null, suffix = ""): string {
  if (value == null) return "—";
  return `${value.toFixed(value >= 100 ? 0 : 2)}${suffix}`;
}

export function ValuationCard({ valuation }: { valuation: ValuationMetrics }) {
  const { t } = useLanguage();

  const rows: { label: string; value: string; hint: string }[] = [
    { label: "P/E", value: fmt(valuation.pe_ttm), hint: t.hintPe },
    { label: "PEG", value: fmt(valuation.peg_ttm), hint: t.hintPeg },
    { label: "P/S", value: fmt(valuation.ps_ttm), hint: t.hintPs },
    { label: "EV/EBITDA", value: fmt(valuation.ev_ebitda_ttm), hint: t.hintEvEbitda },
    { label: "P/B", value: fmt(valuation.pb), hint: t.hintPb },
    { label: t.divYield, value: fmt(valuation.dividend_yield_pct, "%"), hint: t.hintDivYield },
    { label: t.roe, value: fmt(valuation.roe_pct, "%"), hint: t.hintRoe },
    { label: t.netMargin, value: fmt(valuation.net_margin_pct, "%"), hint: t.hintMargin },
    { label: t.revGrowth, value: fmt(valuation.revenue_growth_yoy_pct, "%"), hint: t.hintGrowth },
  ].filter((row) => row.value !== "—");

  if (rows.length === 0) return null;

  return (
    <section className="panel p-4">
      <h2 className="mb-2 text-sm font-medium text-foreground">{t.valuationTitle}</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-line last:border-0">
              <td
                className="cursor-help py-1.5 pr-2 text-muted underline decoration-dotted decoration-line underline-offset-2"
                title={row.hint}
              >
                {row.label}
              </td>
              <td
                className="py-1.5 text-right font-medium text-foreground"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
