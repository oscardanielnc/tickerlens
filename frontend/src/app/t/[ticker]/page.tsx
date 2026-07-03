import { AnalysisView } from "@/components/analysis/AnalysisView";

export default async function TickerPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  // key remounts the view per ticker, resetting all fetch state naturally
  return <AnalysisView key={ticker.toUpperCase()} ticker={ticker.toUpperCase()} />;
}
