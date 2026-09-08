import type {
  AiErrorCategory,
  AiWorkflowName,
  AiWorkflowStatus,
} from "@workspace/db";

export interface AiMetricRow {
  workflow: AiWorkflowName;
  model: string;
  status: AiWorkflowStatus;
  errorCategory: AiErrorCategory | null;
  latencyMs: number;
  estimatedCostUsd: number | null;
}

export interface AiMetricAggregate {
  workflow: AiWorkflowName;
  model: string;
  attempts: number;
  completedWorkflows: number;
  failedAttempts: number;
  successRate: number;
  p95LatencyMs: number;
  totalEstimatedCostUsd: number;
  costPerCompletedWorkflowUsd: number | null;
  unpricedAttempts: number;
  failuresByCategory: Partial<Record<AiErrorCategory, number>>;
}

function rounded(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

export function aggregateAiMetrics(rows: AiMetricRow[]): AiMetricAggregate[] {
  const groups = new Map<string, AiMetricRow[]>();

  for (const row of rows) {
    const key = `${row.workflow}\u0000${row.model}`;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group): AiMetricAggregate => {
      const first = group[0];
      if (!first) {
        throw new Error("AI metrics group unexpectedly empty");
      }

      const completedWorkflows = group.filter(
        (row) => row.status === "succeeded",
      ).length;
      const pricedRows = group.filter((row) => row.estimatedCostUsd !== null);
      const totalEstimatedCostUsd = pricedRows.reduce(
        (sum, row) => sum + (row.estimatedCostUsd ?? 0),
        0,
      );
      const failuresByCategory: Partial<Record<AiErrorCategory, number>> = {};

      for (const row of group) {
        if (row.status === "failed" && row.errorCategory) {
          failuresByCategory[row.errorCategory] =
            (failuresByCategory[row.errorCategory] ?? 0) + 1;
        }
      }

      return {
        workflow: first.workflow,
        model: first.model,
        attempts: group.length,
        completedWorkflows,
        failedAttempts: group.length - completedWorkflows,
        successRate: rounded(completedWorkflows / group.length, 4),
        p95LatencyMs: percentile95(group.map((row) => row.latencyMs)),
        totalEstimatedCostUsd: rounded(totalEstimatedCostUsd, 12),
        costPerCompletedWorkflowUsd:
          completedWorkflows === 0
            ? null
            : rounded(totalEstimatedCostUsd / completedWorkflows, 12),
        unpricedAttempts: group.length - pricedRows.length,
        failuresByCategory,
      };
    })
    .sort(
      (left, right) =>
        left.workflow.localeCompare(right.workflow) ||
        left.model.localeCompare(right.model),
    );
}
