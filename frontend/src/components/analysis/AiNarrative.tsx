"use client";

import { useEffect, useState } from "react";

import { ApiError, streamAiNarrative, type Fact } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Render inline text with **bold** and [F1]/[N2] citation markers. */
function Inline({ text, facts }: { text: string; facts: Map<string, Fact> }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[FN]\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const marker = part.match(/^\[([FN]\d+)\]$/);
        if (marker) {
          const fact = facts.get(marker[1]);
          const chip = (
            <sup
              className="mx-0.5 rounded bg-soft px-1 py-0.5 text-[10px] font-medium text-accent"
              title={fact?.text}
            >
              {marker[1]}
            </sup>
          );
          return fact?.source_url ? (
            <a key={i} href={fact.source_url} target="_blank" rel="noopener noreferrer">
              {chip}
            </a>
          ) : (
            <span key={i}>{chip}</span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Narrative({ markdown, facts }: { markdown: string; facts: Map<string, Fact> }) {
  const blocks = markdown.split("\n").filter((line) => line.trim() !== "");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
      {blocks.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h3 key={i} className="pt-2 text-base font-semibold text-foreground">
              {line.slice(3)}
            </h3>
          );
        }
        if (/^\s*[-*] /.test(line)) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
              <p>
                <Inline text={line.replace(/^\s*[-*] /, "")} facts={facts} />
              </p>
            </div>
          );
        }
        return (
          <p key={i}>
            <Inline text={line} facts={facts} />
          </p>
        );
      })}
    </div>
  );
}

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
          <Narrative markdown={text} facts={factMap} />
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
