import { randomUUID } from "node:crypto";
import type { Request } from "express";
import {
  aiWorkflowRunsTable,
  db,
  type AiErrorCategory,
  type AiWorkflowName,
} from "@workspace/db";
import { logger } from "../lib/logger";

export const GPT_5_NANO_MODEL = "gpt-5-nano";

interface ModelPricing {
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

// Checked against the OpenAI model page on 2026-09-08. Keeping this table
// explicit makes cost estimates reviewable when a model or price changes.
const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5-nano": {
    inputUsdPerMillionTokens: 0.05,
    cachedInputUsdPerMillionTokens: 0.005,
    outputUsdPerMillionTokens: 0.4,
  },
  "gpt-5-nano-2025-08-07": {
    inputUsdPerMillionTokens: 0.05,
    cachedInputUsdPerMillionTokens: 0.005,
    outputUsdPerMillionTokens: 0.4,
  },
};

export interface AiTokenUsage {
  promptTokens: number;
  cachedInputTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiProviderUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
}

export interface AiWorkflowMetadata {
  runId: string;
  requestId: string;
  weddingId: number;
  workflow: AiWorkflowName;
  model: string;
  attempt: number;
}

interface AiWorkflowContext {
  captureUsage: (usage: AiProviderUsage | null | undefined) => void;
}

export class AiWorkflowError extends Error {
  constructor(
    readonly category: AiErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiWorkflowError";
  }
}

function nonNegativeInteger(value: number | null | undefined): number {
  if (!Number.isFinite(value) || value === undefined || value === null) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

export function normalizeAiTokenUsage(
  usage: AiProviderUsage | null | undefined,
): AiTokenUsage {
  const promptTokens = nonNegativeInteger(usage?.prompt_tokens);
  const completionTokens = nonNegativeInteger(usage?.completion_tokens);
  const reportedTotal = nonNegativeInteger(usage?.total_tokens);

  return {
    promptTokens,
    cachedInputTokens: Math.min(
      promptTokens,
      nonNegativeInteger(usage?.prompt_tokens_details?.cached_tokens),
    ),
    completionTokens,
    totalTokens: reportedTotal || promptTokens + completionTokens,
  };
}

export function estimateAiCostUsd(
  model: string,
  usage: AiTokenUsage,
): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;

  const uncachedInputTokens = Math.max(
    0,
    usage.promptTokens - usage.cachedInputTokens,
  );
  const cost =
    (uncachedInputTokens * pricing.inputUsdPerMillionTokens +
      usage.cachedInputTokens * pricing.cachedInputUsdPerMillionTokens +
      usage.completionTokens * pricing.outputUsdPerMillionTokens) /
    1_000_000;

  return Number(cost.toFixed(12));
}

function errorProperties(error: unknown): {
  name?: string;
  code?: string;
  status?: number;
} {
  if (!error || typeof error !== "object") return {};
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
  };
  return {
    ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(typeof candidate.status === "number"
      ? { status: candidate.status }
      : {}),
  };
}

export function classifyAiWorkflowError(error: unknown): AiErrorCategory {
  if (error instanceof AiWorkflowError) return error.category;

  const { name = "", code = "", status } = errorProperties(error);
  const normalizedName = name.toLowerCase();
  const normalizedCode = code.toLowerCase();

  if (
    normalizedName.includes("timeout") ||
    normalizedName === "aborterror" ||
    normalizedCode === "etimedout" ||
    normalizedCode === "econnaborted" ||
    normalizedCode === "request_timeout"
  ) {
    return "timeout";
  }
  if (error instanceof SyntaxError) return "parsing";
  if (normalizedName === "zoderror") return "validation";
  if (
    status !== undefined ||
    normalizedName.startsWith("api") ||
    normalizedCode.startsWith("rate_limit") ||
    normalizedCode.startsWith("insufficient_quota")
  ) {
    return "provider";
  }
  return "application";
}

export function createAiRunId(): string {
  return randomUUID();
}

export function getRequestId(req: Request): string {
  const requestId = (req as Request & { id?: unknown }).id;
  if (
    (typeof requestId === "string" || typeof requestId === "number") &&
    String(requestId).length > 0
  ) {
    return String(requestId).slice(0, 200);
  }
  return randomUUID();
}

export function getSafeErrorDiagnostics(error: unknown): {
  errorCategory: AiErrorCategory;
  providerStatus?: number;
  providerCode?: string;
} {
  const { status, code } = errorProperties(error);
  return {
    errorCategory: classifyAiWorkflowError(error),
    ...(status === undefined ? {} : { providerStatus: status }),
    ...(code === undefined ? {} : { providerCode: code.slice(0, 100) }),
  };
}

async function completeAiWorkflow(
  metadata: AiWorkflowMetadata,
  startedAt: Date,
  usage: AiTokenUsage,
  status: "succeeded" | "failed",
  error?: unknown,
): Promise<void> {
  const completedAt = new Date();
  const latencyMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
  const estimatedCostUsd = estimateAiCostUsd(metadata.model, usage);
  const diagnostics = error ? getSafeErrorDiagnostics(error) : undefined;
  const fields = {
    event: "ai_workflow_completed",
    ...metadata,
    status,
    latencyMs,
    ...usage,
    estimatedCostUsd,
    ...(diagnostics ?? {}),
  };

  if (status === "succeeded") {
    logger.info(fields, "AI workflow succeeded");
  } else {
    logger.warn(fields, "AI workflow failed");
  }

  try {
    await db.insert(aiWorkflowRunsTable).values({
      ...metadata,
      status,
      errorCategory: diagnostics?.errorCategory ?? null,
      latencyMs,
      ...usage,
      estimatedCostUsd,
      startedAt,
      completedAt,
    });
  } catch (telemetryError) {
    logger.error(
      {
        event: "ai_workflow_telemetry_persist_failed",
        runId: metadata.runId,
        requestId: metadata.requestId,
        workflow: metadata.workflow,
        model: metadata.model,
        attempt: metadata.attempt,
        ...getSafeErrorDiagnostics(telemetryError),
      },
      "Could not persist AI workflow telemetry",
    );
  }
}

export async function recordAiWorkflowFailure(
  metadata: AiWorkflowMetadata,
  error: unknown,
  startedAt = new Date(),
): Promise<void> {
  await completeAiWorkflow(
    metadata,
    startedAt,
    normalizeAiTokenUsage(undefined),
    "failed",
    error,
  );
}

export async function observeAiWorkflow<T>(
  metadata: AiWorkflowMetadata,
  run: (context: AiWorkflowContext) => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  let usage = normalizeAiTokenUsage(undefined);

  try {
    const result = await run({
      captureUsage(providerUsage) {
        usage = normalizeAiTokenUsage(providerUsage);
      },
    });
    await completeAiWorkflow(metadata, startedAt, usage, "succeeded");
    return result;
  } catch (error) {
    await completeAiWorkflow(metadata, startedAt, usage, "failed", error);
    throw error;
  }
}
