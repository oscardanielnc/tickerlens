import { CompareView } from "@/components/compare/CompareView";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  // Exactly two: the comparison is head to head, and the AI verdict has to pick
  // a side, which only means something between a pair.
  const tickers = [
    ...new Set(
      (t ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z.]{1,6}$/.test(s)),
    ),
  ].slice(0, 2);
  return <CompareView key={tickers.join(",")} tickers={tickers} />;
}
