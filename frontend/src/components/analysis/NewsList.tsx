"use client";

import type { NewsItem } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function NewsList({ news }: { news: NewsItem[] }) {
  const { t, locale } = useLanguage();

  return (
    <section className="panel p-4">
      <h2 className="mb-3 text-sm font-medium text-foreground">{t.newsTitle}</h2>
      <ul className="space-y-3">
        {news.slice(0, 8).map((item) => (
          <li key={item.source_url}>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              <p className="text-sm text-foreground group-hover:text-accent">
                {item.headline}
              </p>
              <p className="mt-0.5 text-xs text-muted">
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
