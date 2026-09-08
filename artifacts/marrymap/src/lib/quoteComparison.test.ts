import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  QUOTE_COMPARISON_EXPLANATION,
  compareQuoteToPeers,
  comparisonSummary,
  median,
} from "./quoteComparison";

describe("quote comparison", () => {
  test("calculates medians for odd and even peer groups", () => {
    assert.equal(median([]), null);
    assert.equal(median([300, 100, 200]), 200);
    assert.equal(median([300, 100, 200, 400]), 250);
  });

  test("does not imply a comparison when only one quote exists", () => {
    assert.deepEqual(compareQuoteToPeers(2_500, []), {
      state: "insufficient-comparisons",
      peerCount: 0,
      peerMedian: null,
    });
    assert.equal(comparisonSummary(0), null);
  });

  test("uses a strict more-than-20-percent threshold", () => {
    assert.equal(
      compareQuoteToPeers(1_200, [1_000]).state,
      "within-peer-range",
    );
    assert.equal(
      compareQuoteToPeers(1_200.01, [1_000]).state,
      "higher-than-peers",
    );
  });

  test("describes flagged states without claiming market intelligence", () => {
    assert.equal(
      comparisonSummary(1),
      "1 quote is more than 20% above the median of the other same-category quote totals you added.",
    );
    assert.equal(
      comparisonSummary(2),
      "2 quotes are more than 20% above the median of the other same-category quote totals you added.",
    );
    assert.match(QUOTE_COMPARISON_EXPLANATION, /only the quotes you add/);
    assert.match(QUOTE_COMPARISON_EXPLANATION, /not a local market benchmark/);
  });
});
