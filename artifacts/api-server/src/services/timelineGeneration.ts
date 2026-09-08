import { db, timelinesTable, weddingsTable } from "@workspace/db";
import type { TimelineWeek } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import {
  AiWorkflowError,
  GPT_5_NANO_MODEL,
  getSafeErrorDiagnostics,
  observeAiWorkflow,
  recordAiWorkflowFailure,
} from "./aiTelemetry";

export const MAX_TIMELINE_RETRIES = 10;
export const MAX_TIMELINE_ATTEMPTS = MAX_TIMELINE_RETRIES + 1;

export const TimelineGenerationJobSchema = z.object({
  runId: z.string().uuid(),
  requestId: z.string().min(1).max(200),
  attempt: z.number().int().min(1).max(MAX_TIMELINE_ATTEMPTS),
  weddingId: z.number().int().positive(),
  weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().min(1).max(100),
  guestCount: z.number().int().min(1).max(10000),
  style: z.enum(["intimate", "standard", "large"]),
});

export type TimelineGenerationJob = z.infer<typeof TimelineGenerationJobSchema>;

const TimelineResponseSchema = z.object({
  weeks: z
    .array(
      z.object({
        weekLabel: z.string().min(1).max(100),
        phase: z.string().min(1).max(100),
        tasks: z
          .array(
            z.object({
              title: z.string().min(1).max(500),
              priority: z.enum(["urgent", "this-week", "upcoming"]),
            }),
          )
          .min(1)
          .max(3),
      }),
    )
    .min(1)
    .max(24),
});

function buildSystemPrompt(): string {
  return `You are a wedding planning assistant. Return ONLY valid JSON with no prose or markdown.
Output exactly: { "weeks": [ ...entries ] }
Each entry: { "weekLabel": string, "phase": string, "tasks": [{ "title": string, "priority": "urgent"|"this-week"|"upcoming" }] }
phases: "12+ months out" | "6–12 months out" | "3–6 months out" | "final month"
STRICT LIMITS — you MUST respect these or the output will be rejected:
- Maximum 24 entries total across all phases.
- For "12+ months out": 4 entries max, use monthly labels like "Month 12", "Month 10", "Month 8", "Month 7".
- For "6–12 months out": 8 entries max, use labels like "6 months out", "5 months out", etc.
- For "3–6 months out": 8 entries max, use labels like "12 weeks out", "10 weeks out", etc.
- For "final month": 4 entries max, use labels like "4 weeks out", "3 weeks out", "2 weeks out", "Week of wedding".
- 2–3 tasks per entry (not 4).
- No prose, no markdown. Close all JSON brackets. Output must be complete valid JSON.`;
}

function buildUserPrompt(job: TimelineGenerationJob): string {
  const today = new Date().toISOString().split("T")[0];
  return `Wedding: ${job.weddingDate} in ${job.city}. Guests: ${job.guestCount}. Style: ${job.style}. Today: ${today}. Generate a concise timeline — max 24 entries, 2–3 tasks each. Keep it short enough that the full JSON fits in your response.`;
}

export async function recordTimelineGenerationFailure(
  job: Pick<
    TimelineGenerationJob,
    "weddingId" | "runId" | "requestId" | "attempt"
  >,
  error: unknown,
  options: { recordTelemetry?: boolean } = {},
): Promise<void> {
  const diagnostics = getSafeErrorDiagnostics(error);
  const detail = [
    diagnostics.errorCategory,
    diagnostics.providerStatus && `HTTP ${diagnostics.providerStatus}`,
    diagnostics.providerCode,
  ]
    .filter(Boolean)
    .join(" · ");

  logger.error(
    {
      event: "timeline_generation_state_failed",
      workflow: "timeline_generation",
      model: GPT_5_NANO_MODEL,
      weddingId: job.weddingId,
      runId: job.runId,
      requestId: job.requestId,
      attempt: job.attempt,
      maxAttempts: MAX_TIMELINE_ATTEMPTS,
      ...diagnostics,
    },
    "Timeline generation entered a failed state",
  );

  if (options.recordTelemetry) {
    await recordAiWorkflowFailure(
      {
        runId: job.runId,
        requestId: job.requestId,
        weddingId: job.weddingId,
        workflow: "timeline_generation",
        model: GPT_5_NANO_MODEL,
        attempt: job.attempt,
      },
      error,
    );
  }

  await db
    .update(weddingsTable)
    .set({ generationStatus: "failed", generationError: detail })
    .where(eq(weddingsTable.id, job.weddingId))
    .catch((dbError) => {
      logger.error(
        {
          event: "timeline_generation_state_write_failed",
          workflow: "timeline_generation",
          model: GPT_5_NANO_MODEL,
          weddingId: job.weddingId,
          runId: job.runId,
          requestId: job.requestId,
          attempt: job.attempt,
          ...getSafeErrorDiagnostics(dbError),
        },
        "Could not persist the failed timeline state",
      );
    });
}

export async function runTimelineGeneration(
  job: TimelineGenerationJob,
): Promise<void> {
  try {
    await observeAiWorkflow(
      {
        runId: job.runId,
        requestId: job.requestId,
        weddingId: job.weddingId,
        workflow: "timeline_generation",
        model: GPT_5_NANO_MODEL,
        attempt: job.attempt,
      },
      async ({ captureUsage }) => {
        const completion = await openai.chat.completions.create({
          model: GPT_5_NANO_MODEL,
          response_format: { type: "json_object" },
          // The completion ceiling covers both hidden reasoning and visible JSON.
          reasoning_effort: "minimal",
          max_completion_tokens: 8000,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: buildUserPrompt(job) },
          ],
        });
        captureUsage(completion.usage);

        const finishReason = completion.choices[0]?.finish_reason;
        if (finishReason === "length") {
          throw new AiWorkflowError(
            "parsing",
            "Model output was truncated before the JSON document completed",
          );
        }

        const raw = completion.choices[0]?.message?.content ?? "{}";
        const parsed = TimelineResponseSchema.parse(JSON.parse(raw));
        const weeks: TimelineWeek[] = parsed.weeks;

        await db
          .delete(timelinesTable)
          .where(eq(timelinesTable.weddingId, job.weddingId));
        await db
          .insert(timelinesTable)
          .values({ weddingId: job.weddingId, tasks: weeks });

        await db
          .update(weddingsTable)
          .set({ generationStatus: "ready", generationError: null })
          .where(eq(weddingsTable.id, job.weddingId));
      },
    );
  } catch (error) {
    await recordTimelineGenerationFailure(job, error);
  }
}

function getBackgroundFunctionUrl(): string {
  const explicitUrl = process.env.NETLIFY_BACKGROUND_FUNCTION_URL;
  if (explicitUrl) return explicitUrl;

  const siteUrl = process.env.URL;
  if (!siteUrl) {
    throw new Error(
      "URL or NETLIFY_BACKGROUND_FUNCTION_URL must be set on Netlify",
    );
  }

  return `${siteUrl.replace(/\/$/, "")}/.netlify/functions/timeline-generation-background`;
}

export async function dispatchTimelineGeneration(
  job: TimelineGenerationJob,
): Promise<void> {
  const isNetlifyRuntime =
    process.env.NETLIFY === "true" || Boolean(process.env.SITE_ID);
  const logFields = {
    event: "ai_workflow_dispatched",
    workflow: "timeline_generation",
    model: GPT_5_NANO_MODEL,
    weddingId: job.weddingId,
    runId: job.runId,
    requestId: job.requestId,
    attempt: job.attempt,
    maxAttempts: MAX_TIMELINE_ATTEMPTS,
    execution: isNetlifyRuntime ? "netlify_background" : "local_background",
  };

  if (!isNetlifyRuntime) {
    logger.info(logFields, "Timeline generation dispatched");
    void runTimelineGeneration(job);
    return;
  }

  const secret = process.env.NETLIFY_BACKGROUND_SECRET;
  if (!secret) {
    throw new Error("NETLIFY_BACKGROUND_SECRET is not configured");
  }

  const response = await fetch(getBackgroundFunctionUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(job),
  });

  if (response.status !== 202) {
    throw new Error(
      `Netlify background function returned HTTP ${response.status}`,
    );
  }

  logger.info(logFields, "Timeline generation dispatched");
}
