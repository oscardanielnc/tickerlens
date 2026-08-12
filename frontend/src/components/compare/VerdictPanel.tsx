"use client";

import { useEffect, useState } from "react";

import { StreamedMarkdown } from "@/components/ai/StreamedMarkdown";
import { ApiError, streamCompareVerdict, type RetrievedSource } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * The RAG half of the comparison: the backend retrieves the most relevant
 * excerpts about both tickers from its own analysis index, then streams a
 * verdict grounded in them. The excerpts arrive as the first SSE frame, so the
 * citation list can render while the tokens are still coming in.
 *
 * Verdict markers are `[NVDA/F3]` — prefixed with the ticker, because both
 * companies number their facts from F1.
 */
export function VerdictPanel({ tickerA, tickerB }: { tickerA: string; tickerB: string }) {
  const { t, locale } = useLanguage();
  const [text, setText] = useState("");
  const [sources, setSources] = useState<RetrievedSource[]>([]);
  const [status, setStatus] = useState<"streaming" | "done" | "error">("streaming");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    streamCompareVerdict(
      tickerA,
      tickerB,
      locale,
      {
        onDelta: (delta) => setText((prev) => prev + delta),
        onSources: setSources,
      },
      controller.signal,
    )
      .then(() => setStatus("done"))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(
          err instanceof ApiError && err.status === 503
            ? t.verdictUnavailable
            : t.verdictError,
        );
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerA, tickerB, locale]);

  const byRef = new Map(sources.map((s) => [s.ref, s]));

  return (
    <section className="panel p-4">
      <h2 className="text-sm font-medium text-foreground">
        🤖 {t.verdictTitle}: {tickerA} vs {tickerB}
      </h2>
      <p className="mb-3 mt-1 text-xs text-muted">{t.verdictHint}</p>

      {status === "error" ? (
        <p className="text-sm text-warning">{error}</p>
      ) : (
        <>
          <StreamedMarkdown
            markdown={text}
            markerPattern="[A-Z.]{1,6}/[FN]\d+"
            resolve={(marker) => {
              const source = byRef.get(marker);
              return source && { text: source.text, url: source.source_url };
            }}
          />
          {status === "streaming" && (
            <span className="mt-1 inline-block h-4 w-2 animate-pulse bg-accent" />
          )}
        </>
      )}

      {sources.length > 0 && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            {t.verdictSourcesTitle} ({sources.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {sources.map((source) => (
              <li key={source.ref}>
                <span className="mr-1 font-mono text-accent">{source.ref}</span>
                {source.text}{" "}
                {source.source_url && (
                  <a
                    href={source.source_url}
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
      )}
    </section>
  );
}
