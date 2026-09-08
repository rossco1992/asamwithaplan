import { aiWorkflowRunsTable, db, pool } from "@workspace/db";
import { gte } from "drizzle-orm";
import { aggregateAiMetrics } from "../services/aiMetrics";

function reportWindowDays(): number {
  const raw = process.env.AI_REPORT_SINCE_DAYS ?? "30";
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error("AI_REPORT_SINCE_DAYS must be an integer from 1 to 3650");
  }
  return days;
}

async function main(): Promise<void> {
  const days = reportWindowDays();
  const generatedAt = new Date();
  const since = new Date(generatedAt.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      workflow: aiWorkflowRunsTable.workflow,
      model: aiWorkflowRunsTable.model,
      status: aiWorkflowRunsTable.status,
      errorCategory: aiWorkflowRunsTable.errorCategory,
      latencyMs: aiWorkflowRunsTable.latencyMs,
      estimatedCostUsd: aiWorkflowRunsTable.estimatedCostUsd,
    })
    .from(aiWorkflowRunsTable)
    .where(gte(aiWorkflowRunsTable.startedAt, since));

  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: generatedAt.toISOString(),
        since: since.toISOString(),
        windowDays: days,
        groups: aggregateAiMetrics(rows),
      },
      null,
      2,
    )}\n`,
  );
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`AI metrics report failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
