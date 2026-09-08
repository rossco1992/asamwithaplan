import {
  runTimelineGeneration,
  TimelineGenerationJobSchema,
} from "../../../api-server/src/services/timelineGeneration";
import { logger } from "../../../api-server/src/lib/logger";

type BackgroundEvent = {
  body: string | null;
  headers: Record<string, string | undefined>;
};

type BackgroundHandler = (event: BackgroundEvent) => Promise<void>;

export const handler: BackgroundHandler = async (event) => {
  const expectedSecret = process.env.NETLIFY_BACKGROUND_SECRET;
  const suppliedSecret =
    event.headers.authorization ?? event.headers.Authorization;

  if (!expectedSecret || suppliedSecret !== `Bearer ${expectedSecret}`) {
    logger.warn(
      { event: "timeline_generation_background_rejected" },
      "Rejected unauthorized timeline background invocation",
    );
    return;
  }

  if (!event.body) {
    logger.warn(
      { event: "timeline_generation_background_invalid", reason: "no_body" },
      "Timeline background invocation did not include a body",
    );
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(event.body);
  } catch {
    logger.warn(
      {
        event: "timeline_generation_background_invalid",
        reason: "invalid_json",
      },
      "Timeline background invocation contained invalid JSON",
    );
    return;
  }

  const parsed = TimelineGenerationJobSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn(
      {
        event: "timeline_generation_background_invalid",
        reason: "invalid_job",
        issueCount: parsed.error.issues.length,
      },
      "Timeline background invocation contained an invalid job",
    );
    return;
  }

  logger.info(
    {
      event: "timeline_generation_background_received",
      workflow: "timeline_generation",
      weddingId: parsed.data.weddingId,
      runId: parsed.data.runId,
      requestId: parsed.data.requestId,
      attempt: parsed.data.attempt,
    },
    "Timeline background invocation received",
  );
  await runTimelineGeneration(parsed.data);
};
