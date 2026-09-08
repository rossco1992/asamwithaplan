export const QUOTE_COMPARISON_THRESHOLD = 0.2;

export const QUOTE_COMPARISON_EXPLANATION =
  "Comparisons use only the quotes you add in each category. A higher-total flag means a quote is more than 20% above the median of your other same-category quote totals; it is not a local market benchmark.";

export type QuoteComparisonState =
  "insufficient-comparisons" | "within-peer-range" | "higher-than-peers";

export interface QuoteComparison {
  state: QuoteComparisonState;
  peerCount: number;
  peerMedian: number | null;
}

export function median(values: number[]): number | null {
  const finiteValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finiteValues.length === 0) return null;

  const middle = Math.floor(finiteValues.length / 2);
  return finiteValues.length % 2 === 1
    ? finiteValues[middle]
    : (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}

export function compareQuoteToPeers(
  amount: number,
  peerAmounts: number[],
): QuoteComparison {
  const peerMedian = median(peerAmounts);

  if (peerMedian === null) {
    return {
      state: "insufficient-comparisons",
      peerCount: 0,
      peerMedian: null,
    };
  }

  return {
    state:
      amount > peerMedian * (1 + QUOTE_COMPARISON_THRESHOLD)
        ? "higher-than-peers"
        : "within-peer-range",
    peerCount: peerAmounts.filter(Number.isFinite).length,
    peerMedian,
  };
}

export function comparisonSummary(flaggedCount: number): string | null {
  if (flaggedCount <= 0) return null;

  return `${flaggedCount} quote${flaggedCount === 1 ? " is" : "s are"} more than 20% above the median of the other same-category quote totals you added.`;
}
