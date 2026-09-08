import {
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { weddingsTable } from "./weddings";

export const aiWorkflowNames = [
  "timeline_generation",
  "quote_parsing",
] as const;
export type AiWorkflowName = (typeof aiWorkflowNames)[number];

export const aiWorkflowStatuses = ["succeeded", "failed"] as const;
export type AiWorkflowStatus = (typeof aiWorkflowStatuses)[number];

export const aiErrorCategories = [
  "provider",
  "validation",
  "parsing",
  "timeout",
  "application",
] as const;
export type AiErrorCategory = (typeof aiErrorCategories)[number];

export const aiWorkflowRunsTable = pgTable("ai_workflow_runs", {
  runId: text("run_id").primaryKey(),
  weddingId: integer("wedding_id").references(() => weddingsTable.id, {
    onDelete: "set null",
  }),
  requestId: text("request_id").notNull(),
  workflow: text("workflow").$type<AiWorkflowName>().notNull(),
  model: text("model").notNull(),
  status: text("status").$type<AiWorkflowStatus>().notNull(),
  errorCategory: text("error_category").$type<AiErrorCategory>(),
  latencyMs: integer("latency_ms").notNull(),
  promptTokens: integer("prompt_tokens").default(0).notNull(),
  cachedInputTokens: integer("cached_input_tokens").default(0).notNull(),
  completionTokens: integer("completion_tokens").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  estimatedCostUsd: doublePrecision("estimated_cost_usd"),
  attempt: integer("attempt").default(1).notNull(),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at").notNull(),
});

export type AiWorkflowRun = typeof aiWorkflowRunsTable.$inferSelect;
export type InsertAiWorkflowRun = typeof aiWorkflowRunsTable.$inferInsert;
