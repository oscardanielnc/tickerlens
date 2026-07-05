export type Verdict = "good" | "bad" | null;

/** Code-computed traffic light per ratio: lowBetter = green below `good`, red above `bad`. */
export function judge(value: number, good: number, bad: number, lowBetter: boolean): Verdict {
  if (lowBetter) return value <= good ? "good" : value >= bad ? "bad" : null;
  return value >= good ? "good" : value <= bad ? "bad" : null;
}

/** Shared thresholds so the valuation card and the compare table always agree. */
export const judges = {
  pe: (v: number) => judge(v, 20, 40, true),
  peg: (v: number) => judge(v, 1, 2, true),
  ps: (v: number) => judge(v, 2, 10, true),
  evEbitda: (v: number) => judge(v, 10, 20, true),
  pb: (v: number) => judge(v, 1.5, 10, true),
  // No dividend isn't a red flag (growth companies reinvest), so never "bad"
  divYield: (v: number): Verdict => (v >= 3 ? "good" : null),
  roe: (v: number) => judge(v, 15, 5, false),
  margin: (v: number) => judge(v, 20, 5, false),
  growth: (v: number) => judge(v, 10, 0, false),
};
