import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";

const { pool } = await import("@workspace/db");
const {
  AiWorkflowError,
  classifyAiWorkflowError,
  estimateAiCostUsd,
  normalizeAiTokenUsage,
} = await import("../services/aiTelemetry.ts");
const { aggregateAiMetrics, percentile95 } =
  await import("../services/aiMetrics.ts");

after(async () => {
  await pool.end();
});

describe("AI workflow telemetry", () => {
  test("normalizes token usage and estimates cached-token-aware cost", () => {
    const usage = normalizeAiTokenUsage({
      prompt_tokens: 1_000_000,
      completion_tokens: 500_000,
      total_tokens: 1_500_000,
      prompt_tokens_details: { cached_tokens: 250_000 },
    });

    assert.deepEqual(usage, {
      promptTokens: 1_000_000,
      cachedInputTokens: 250_000,
      completionTokens: 500_000,
      totalTokens: 1_500_000,
    });
    assert.equal(estimateAiCostUsd("gpt-5-nano", usage), 0.23875);
    assert.equal(estimateAiCostUsd("unpriced-model", usage), null);
  });

  test("categorizes provider, validation, parsing, timeout, and app failures", () => {
    assert.equal(
      classifyAiWorkflowError({ name: "APIConnectionError" }),
      "provider",
    );
    assert.equal(classifyAiWorkflowError({ name: "ZodError" }), "validation");
    assert.equal(
      classifyAiWorkflowError(new SyntaxError("bad JSON")),
      "parsing",
    );
    assert.equal(classifyAiWorkflowError({ name: "AbortError" }), "timeout");
    assert.equal(
      classifyAiWorkflowError(
        new AiWorkflowError("parsing", "truncated output"),
      ),
      "parsing",
    );
    assert.equal(
      classifyAiWorkflowError(new Error("database failed")),
      "application",
    );
  });

  test("reports success rate, p95 latency, cost per completion, and failures", () => {
    assert.equal(percentile95([10, 30, 20, 50, 40]), 50);

    const aggregates = aggregateAiMetrics([
      {
        workflow: "timeline_generation",
        model: "gpt-5-nano",
        status: "succeeded",
        errorCategory: null,
        latencyMs: 100,
        estimatedCostUsd: 0.002,
      },
      {
        workflow: "timeline_generation",
        model: "gpt-5-nano",
        status: "failed",
        errorCategory: "timeout",
        latencyMs: 250,
        estimatedCostUsd: 0.001,
      },
      {
        workflow: "timeline_generation",
        model: "gpt-5-nano",
        status: "succeeded",
        errorCategory: null,
        latencyMs: 150,
        estimatedCostUsd: 0.003,
      },
    ]);

    assert.deepEqual(aggregates, [
      {
        workflow: "timeline_generation",
        model: "gpt-5-nano",
        attempts: 3,
        completedWorkflows: 2,
        failedAttempts: 1,
        successRate: 0.6667,
        p95LatencyMs: 250,
        totalEstimatedCostUsd: 0.006,
        costPerCompletedWorkflowUsd: 0.003,
        unpricedAttempts: 0,
        failuresByCategory: { timeout: 1 },
      },
    ]);
  });
});
