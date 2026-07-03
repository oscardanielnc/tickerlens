"use client";

import { locales } from "@/lib/i18n/dictionaries";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function LanguageSwitch() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex items-center gap-1 rounded-full border border-zinc-700 p-1 text-xs">
      {locales.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`rounded-full px-2.5 py-1 uppercase transition-colors ${
            locale === l
              ? "bg-emerald-500 text-zinc-950 font-semibold"
              : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
