"use client";

import type { NewsItem } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function NewsList({ news }: { news: NewsItem[] }) {
  const { t, locale } = useLanguage();

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium text-zinc-300">{t.newsTitle}</h2>
      <ul className="space-y-3">
        {news.slice(0, 8).map((item) => (
          <li key={item.source_url}>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              <p className="text-sm text-zinc-200 group-hover:text-emerald-300">
                {item.headline}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {item.source_name} ·{" "}
                {new Date(item.published_at).toLocaleDateString(
                  locale === "es" ? "es-PE" : "en-US",
                  { month: "short", day: "numeric" },
                )}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
