/**
 * Central visual tokens for charts and semantic accents.
 * Pastel light palette taken from the author's `investor` dashboard
 * (bg #f5f6fa, white cards, desaturated green/red, soft blue accent).
 * Components reference roles, never raw hex.
 */
export const CHART = {
  price: "#5b8def", // soft blue — price line (investor accent)
  priceFill: "rgba(91, 141, 239, 0.10)",
  support: "#1faa6b", // pastel green
  resistance: "#e1576b", // pastel red
  grid: "#eef1f6",
  axis: "#e7eaf0",
  muted: "#7a8595",
  crosshair: "#7a8595",
  tooltipBg: "#ffffff",
  tooltipText: "#222a37",
  tooltipMuted: "#7a8595",
  revenue: "#aecbfa", // pastel blue tint (investor sector palette)
  revenueText: "#2f5fb0",
  netIncome: "#b7e1cd", // pastel green tint
  netIncomeText: "#1d7a52",
  opex: "#fce4b3", // pastel amber tint
  opexText: "#9a6b15",
};

export const SEMANTIC = {
  positive: "#1faa6b",
  negative: "#e1576b",
  warning: "#c8922a",
};
