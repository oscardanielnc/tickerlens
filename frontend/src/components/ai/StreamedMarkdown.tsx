"use client";

/**
 * The tiny markdown subset the AI prompts are allowed to emit: headings,
 * bullets, **bold** and citation markers. Shared by the per-ticker narrative
 * (markers like `[F3]`) and the comparison verdict (`[NVDA/F3]`), which is why
 * the marker syntax is a parameter rather than hardcoded.
 *
 * Deliberately not a markdown library: the input is streamed token by token and
 * re-rendered on every chunk, so parsing stays a couple of regexes over lines.
 */

export interface Citation {
  text: string;
  url: string | null;
}

interface Props {
  markdown: string;
  /** Regex source matching a marker's *inside*, e.g. `[FN]\d+`. No groups. */
  markerPattern: string;
  /** Resolve a marker's inside (e.g. `F3`) to its tooltip text and link. */
  resolve: (marker: string) => Citation | undefined;
}

function Inline({ text, markerPattern, resolve }: { text: string } & Omit<Props, "markdown">) {
  const splitter = new RegExp(`(\\*\\*[^*]+\\*\\*|\\[${markerPattern}\\])`, "g");
  const marker = new RegExp(`^\\[(${markerPattern})\\]$`);

  return (
    <>
      {text.split(splitter).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const found = part.match(marker);
        if (found) {
          const citation = resolve(found[1]);
          const chip = (
            <sup
              className="mx-0.5 rounded bg-soft px-1 py-0.5 text-[10px] font-medium text-accent"
              title={citation?.text}
            >
              {found[1]}
            </sup>
          );
          return citation?.url ? (
            <a key={i} href={citation.url} target="_blank" rel="noopener noreferrer">
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

export function StreamedMarkdown({ markdown, markerPattern, resolve }: Props) {
  const lines = markdown.split("\n").filter((line) => line.trim() !== "");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h3 key={i} className="pt-2 text-base font-semibold text-foreground">
              {line.slice(3)}
            </h3>
          );
        }
        const inline = (
          <Inline
            text={line.replace(/^\s*[-*] /, "")}
            markerPattern={markerPattern}
            resolve={resolve}
          />
        );
        if (/^\s*[-*] /.test(line)) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
              <p>{inline}</p>
            </div>
          );
        }
        return <p key={i}>{inline}</p>;
      })}
    </div>
  );
}
