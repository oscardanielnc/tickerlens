const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Quote {
  ticker: string;
  price: number;
  change_percent: number;
  as_of: string;
  source_url: string;
}

export interface CompanyProfile {
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  website: string | null;
  market_cap: number | null;
  source_url: string;
}

export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TrendTemplate {
  passed: number;
  checked: number;
  checks: Record<string, boolean | null>;
}

export interface TechnicalSnapshot {
  price: number;
  change_percent_day: number;
  ema20: number;
  ema50: number | null;
  ema150: number | null;
  ema200: number | null;
  rsi14: number;
  rsi_state: "overbought" | "oversold" | "neutral";
  macd_state: "bullish" | "bearish";
  macd_cross: string;
  bollinger_upper: number;
  bollinger_lower: number;
  atr14: number;
  trend: "uptrend" | "downtrend" | "sideways";
  volume_state: "high" | "low" | "normal";
  high_52w: number;
  low_52w: number;
  distance_to_52w_high_pct: number;
  rs_vs_spy_3m: number | null;
  trend_template: TrendTemplate;
}

export interface Level {
  price: number;
  kind: "support" | "resistance";
  strength: number;
  distance_percent: number;
  methods: string[];
  touches: number;
}

export interface LevelsResult {
  supports: Level[];
  resistances: Level[];
  nearest_support: Level | null;
  nearest_resistance: Level | null;
  suggested_entry: number | null;
}

export interface EarningsEvent {
  ticker: string;
  date: string;
  hour: string | null;
  eps_estimate: number | null;
  revenue_estimate: number | null;
  source_url: string;
}

export interface NewsItem {
  headline: string;
  summary: string | null;
  published_at: string;
  source_name: string;
  source_url: string;
}

export interface FinancialsPeriod {
  period: string;
  end_date: string;
  revenue: number | null;
  net_income: number | null;
  gross_profit: number | null;
  operating_expenses: number | null;
}

export interface Fundamentals {
  ticker: string;
  quarterly: FinancialsPeriod[];
  annual: FinancialsPeriod[];
  source_url: string;
}

export interface ValuationMetrics {
  pe_ttm: number | null;
  peg_ttm: number | null;
  ps_ttm: number | null;
  pb: number | null;
  ev_ebitda_ttm: number | null;
  ev_revenue_ttm: number | null;
  dividend_yield_pct: number | null;
  net_margin_pct: number | null;
  roe_pct: number | null;
  revenue_growth_yoy_pct: number | null;
  source_url: string;
}

export interface Fact {
  ref: string;
  text: string;
  source_url: string | null;
}

export interface AnalysisPayload {
  ticker: string;
  quote: Quote;
  profile: CompanyProfile;
  candles: Candle[];
  technical: TechnicalSnapshot;
  levels: LevelsResult;
  earnings: EarningsEvent[];
  news: NewsItem[];
  fundamentals: Fundamentals | null;
  valuation: ValuationMetrics | null;
  facts: Fact[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchAnalysis(ticker: string): Promise<AnalysisPayload> {
  const response = await fetch(`${API_URL}/api/analysis/${encodeURIComponent(ticker)}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

/** Stream the AI narrative over SSE, invoking onDelta per token chunk. */
export async function streamAiNarrative(
  ticker: string,
  lang: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/analysis/${encodeURIComponent(ticker)}/ai?lang=${lang}`,
    { signal },
  );
  if (!response.ok || !response.body) {
    throw new ApiError(response.status, "AI stream failed");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const data = event.replace(/^data: /, "").trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) throw new ApiError(502, parsed.error);
        if (parsed.delta) onDelta(parsed.delta);
      } catch (err) {
        if (err instanceof ApiError) throw err;
      }
    }
  }
}
