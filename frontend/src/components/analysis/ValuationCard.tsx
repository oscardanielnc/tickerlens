"use client";

import type { ValuationMetrics } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { SEMANTIC } from "@/lib/theme";

type Verdict = "good" | "bad" | null;

function fmt(value: number | null, suffix = ""): string {
  if (value == null) return "—";
  return `${value.toFixed(value >= 100 ? 0 : 2)}${suffix}`;
}

/** Code-computed traffic light per ratio: lowBetter = green below `good`, red above `bad`. */
function judge(value: number, good: number, bad: number, lowBetter: boolean): Verdict {
  if (lowBetter) return value <= good ? "good" : value >= bad ? "bad" : null;
  return value >= good ? "good" : value <= bad ? "bad" : null;
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
      v.pe_ttm != null ? judge(v.pe_ttm, 20, 40, true) : null,
      t.vGoodPe,
      t.vBadPe,
    ),
    make(
      "PEG",
      v.peg_ttm,
      t.hintPeg,
      v.peg_ttm != null ? judge(v.peg_ttm, 1, 2, true) : null,
      t.vGoodPeg,
      t.vBadPeg,
    ),
    make(
      "P/S",
      v.ps_ttm,
      t.hintPs,
      v.ps_ttm != null ? judge(v.ps_ttm, 2, 10, true) : null,
      t.vGoodPs,
      t.vBadPs,
    ),
    make(
      "EV/EBITDA",
      v.ev_ebitda_ttm,
      t.hintEvEbitda,
      v.ev_ebitda_ttm != null ? judge(v.ev_ebitda_ttm, 10, 20, true) : null,
      t.vGoodEv,
      t.vBadEv,
    ),
    make(
      "P/B",
      v.pb,
      t.hintPb,
      v.pb != null ? judge(v.pb, 1.5, 10, true) : null,
      t.vGoodPb,
      t.vBadPb,
    ),
    make(
      t.divYield,
      v.dividend_yield_pct,
      t.hintDivYield,
      // No dividend isn't a red flag (growth companies reinvest), so never "bad"
      v.dividend_yield_pct != null && v.dividend_yield_pct >= 3 ? "good" : null,
      t.vGoodDiv,
      "",
      "%",
    ),
    make(
      t.roe,
      v.roe_pct,
      t.hintRoe,
      v.roe_pct != null ? judge(v.roe_pct, 15, 5, false) : null,
      t.vGoodRoe,
      t.vBadRoe,
      "%",
    ),
    make(
      t.netMargin,
      v.net_margin_pct,
      t.hintMargin,
      v.net_margin_pct != null ? judge(v.net_margin_pct, 20, 5, false) : null,
      t.vGoodMargin,
      t.vBadMargin,
      "%",
    ),
    make(
      t.revGrowth,
      v.revenue_growth_yoy_pct,
      t.hintGrowth,
      v.revenue_growth_yoy_pct != null ? judge(v.revenue_growth_yoy_pct, 10, 0, false) : null,
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
