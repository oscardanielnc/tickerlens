/**
 * Central visual tokens for charts and semantic accents.
 * Palette style: soft pastels (matching the author's kepler/investor projects).
 * Values are swapped in one place — components reference roles, never raw hex.
 */
export const CHART = {
  price: "#8ab8e8", // pastel blue — price line
  priceFill: "rgba(138, 184, 232, 0.10)",
  support: "#8fd4a8", // pastel green
  resistance: "#f2a0a0", // pastel red
  grid: "#2c2c2a",
  axis: "#383835",
  muted: "#898781",
  crosshair: "#c3c2b7",
  tooltipBg: "#101012",
  revenue: "#8ab8e8", // series 1 — pastel blue
  netIncome: "#8fd4a8", // series 2 — pastel green
  opex: "#e8c98a", // series 3 — pastel amber
};

export const SEMANTIC = {
  positive: "#8fd4a8",
  negative: "#f2a0a0",
  warning: "#e8c98a",
};
