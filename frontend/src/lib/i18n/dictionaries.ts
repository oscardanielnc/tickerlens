export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

const en = {
  appName: "TickerLens",
  tagline: "AI-assisted equity analysis, with every claim linked to its source.",
  searchPlaceholder: "Search a ticker, e.g. NVDA",
  searchButton: "Analyze",
  comingSoon: "The analysis engine is under construction — coming in the next release.",
  disclaimer:
    "Not financial advice. TickerLens is an educational and research tool; all signals and AI commentary are informational only.",
  footerSource: "Source code",
};

export type Dictionary = { [K in keyof typeof en]: string };

const es: Dictionary = {
  appName: "TickerLens",
  tagline: "Análisis de acciones asistido por IA, con cada afirmación enlazada a su fuente.",
  searchPlaceholder: "Busca un ticker, ej. NVDA",
  searchButton: "Analizar",
  comingSoon: "El motor de análisis está en construcción — llega en la próxima versión.",
  disclaimer:
    "No es asesoría financiera. TickerLens es una herramienta educativa y de investigación; todas las señales y comentarios de IA son solo informativos.",
  footerSource: "Código fuente",
};

export const dictionaries: Record<Locale, Dictionary> = { en, es };
