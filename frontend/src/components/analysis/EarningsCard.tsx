"use client";

import type { EarningsEvent } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function EarningsCard({ earnings }: { earnings: EarningsEvent[] }) {
  const { t, locale } = useLanguage();
  const next = earnings[0];

  return (
    <section className="panel p-4">
      <h2 className="mb-2 text-sm font-medium text-foreground">{t.earningsTitle}</h2>
      {!next ? (
        <p className="text-sm text-muted">{t.earningsNone}</p>
      ) : (
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-semibold text-foreground">
            {new Date(`${next.date}T12:00:00`).toLocaleDateString(
              locale === "es" ? "es-PE" : "en-US",
              { month: "long", day: "numeric", year: "numeric" },
            )}
          </span>
          {next.hour && (
            <span className="rounded bg-soft px-1.5 py-0.5 text-xs uppercase text-muted">
              {next.hour}
            </span>
          )}
          {next.eps_estimate != null && (
            <span className="text-sm text-muted">
              {t.epsEstimate}: {next.eps_estimate}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
