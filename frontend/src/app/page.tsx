"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function Home() {
  const { t } = useLanguage();
  const router = useRouter();
  const [ticker, setTicker] = useState("");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">
          Ticker<span className="text-accent">Lens</span>
        </span>
        <LanguageSwitch />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Ticker<span className="text-accent">Lens</span>
        </h1>
        <p className="max-w-xl text-lg text-muted">{t.tagline}</p>

        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ticker.trim()) router.push(`/t/${ticker.trim().toUpperCase()}`);
          }}
        >
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder={t.searchPlaceholder}
            className="panel flex-1 px-4 py-3 font-mono uppercase placeholder:normal-case placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none"
            maxLength={6}
          />
          <button
            type="submit"
            className="rounded-xl bg-accent px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90"
          >
            {t.searchButton}
          </button>
        </form>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted">
        <p className="mx-auto max-w-2xl">⚠️ {t.disclaimer}</p>
        <a
          href="https://github.com/oscardanielnc/tickerlens"
          className="mt-2 inline-block underline hover:text-foreground"
        >
          {t.footerSource}
        </a>
      </footer>
    </div>
  );
}
