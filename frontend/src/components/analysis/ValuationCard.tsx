"use client";

import type { ValuationMetrics } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { SEMANTIC } from "@/lib/theme";
import { judges, type Verdict } from "@/lib/verdict";

function fmt(value: number | null, suffix = ""): string {
  if (value == null) return "—";
  return `${value.toFixed(value >= 100 ? 0 : 2)}${suffix}`;
}

interface Row {
  label: string;
  value: string;
  verdict: Verdict;
  tooltip: string;
}

function buildRows(v: ValuationMetrics, t: Dictionary): Row[] {
  const make = (
    label: string,
    raw: number | null,
    hint: string,
    verdict: Verdict,
    goodText: string,
    badText: string,
    suffix = "",
  ): Row | null =>
    raw == null
      ? null
      : {
          label,
          value: fmt(raw, suffix),
          verdict,
          tooltip:
            hint + (verdict === "good" ? `\n${goodText}` : verdict === "bad" ? `\n${badText}` : ""),
        };

  return [
    make(
      "P/E",
      v.pe_ttm,
      t.hintPe,
      v.pe_ttm != null ? judges.pe(v.pe_ttm) : null,
      t.vGoodPe,
      t.vBadPe,
    ),
    make(
      "PEG",
      v.peg_ttm,
      t.hintPeg,
      v.peg_ttm != null ? judges.peg(v.peg_ttm) : null,
      t.vGoodPeg,
      t.vBadPeg,
    ),
    make(
      "P/S",
      v.ps_ttm,
      t.hintPs,
      v.ps_ttm != null ? judges.ps(v.ps_ttm) : null,
      t.vGoodPs,
      t.vBadPs,
    ),
    make(
      "EV/EBITDA",
      v.ev_ebitda_ttm,
      t.hintEvEbitda,
      v.ev_ebitda_ttm != null ? judges.evEbitda(v.ev_ebitda_ttm) : null,
      t.vGoodEv,
      t.vBadEv,
    ),
    make(
      "P/B",
      v.pb,
      t.hintPb,
      v.pb != null ? judges.pb(v.pb) : null,
      t.vGoodPb,
      t.vBadPb,
    ),
    make(
      t.divYield,
      v.dividend_yield_pct,
      t.hintDivYield,
      v.dividend_yield_pct != null ? judges.divYield(v.dividend_yield_pct) : null,
      t.vGoodDiv,
      "",
      "%",
    ),
    make(
      t.roe,
      v.roe_pct,
      t.hintRoe,
      v.roe_pct != null ? judges.roe(v.roe_pct) : null,
      t.vGoodRoe,
      t.vBadRoe,
      "%",
    ),
    make(
      t.netMargin,
      v.net_margin_pct,
      t.hintMargin,
      v.net_margin_pct != null ? judges.margin(v.net_margin_pct) : null,
      t.vGoodMargin,
      t.vBadMargin,
      "%",
    ),
    make(
      t.revGrowth,
      v.revenue_growth_yoy_pct,
      t.hintGrowth,
      v.revenue_growth_yoy_pct != null ? judges.growth(v.revenue_growth_yoy_pct) : null,
      t.vGoodGrowth,
      t.vBadGrowth,
      "%",
    ),
  ].filter((row): row is Row => row !== null);
}

export function ValuationCard({ valuation }: { valuation: ValuationMetrics }) {
  const { t } = useLanguage();
  const rows = buildRows(valuation, t);
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
                title={row.tooltip}
              >
                {row.label}
              </td>
              <td
                className="cursor-help py-1.5 text-right font-medium"
                title={row.tooltip}
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color:
                    row.verdict === "good"
                      ? SEMANTIC.positive
                      : row.verdict === "bad"
                        ? SEMANTIC.negative
                        : undefined,
                }}
              >
                {row.verdict === "good" ? "▲ " : row.verdict === "bad" ? "▼ " : ""}
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
