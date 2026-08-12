"use client";

import { useEffect, useState } from "react";

import { StreamedMarkdown } from "@/components/ai/StreamedMarkdown";
import { ApiError, streamAiNarrative, type Fact } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Streams one narrative per (ticker, locale); the parent remounts it via `key`. */
export function AiNarrative({ ticker, facts }: { ticker: string; facts: Fact[] }) {
  const { t, locale } = useLanguage();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"streaming" | "done" | "error">("streaming");
  const [error, setError] = useState<string | null>(null);

  const factMap = new Map(facts.map((f) => [f.ref, f]));

  useEffect(() => {
    const controller = new AbortController();
    streamAiNarrative(
      ticker,
      locale,
      (delta) => setText((prev) => prev + delta),
      controller.signal,
    )
      .then(() => setStatus("done"))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(
          err instanceof ApiError && err.status === 429 ? t.errorRateLimit : t.errorGeneric,
        );
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, locale]);

  return (
    <section className="panel p-4">
      <h2 className="text-sm font-medium text-foreground">{t.aiTitle}</h2>
      <p className="mb-3 mt-1 text-xs text-muted">{t.aiHint}</p>

      {status === "error" ? (
        <p className="text-sm text-warning">{error}</p>
      ) : (
        <>
          <StreamedMarkdown
            markdown={text}
            markerPattern="[FN]\d+"
            resolve={(marker) => {
              const fact = factMap.get(marker);
              return fact && { text: fact.text, url: fact.source_url };
            }}
          />
          {status === "streaming" && (
            <span className="mt-1 inline-block h-4 w-2 animate-pulse bg-accent" />
          )}
        </>
      )}

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted">
          {t.aiSourcesTitle}
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {facts.map((fact) => (
            <li key={fact.ref}>
              <span className="mr-1 font-mono text-accent">{fact.ref}</span>
              {fact.text}{" "}
              {fact.source_url && (
                <a
                  href={fact.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/70 underline"
                >
                  {t.sourceLink}
                </a>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
