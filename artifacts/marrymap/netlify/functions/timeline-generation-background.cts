import {
  runTimelineGeneration,
  TimelineGenerationJobSchema,
} from "../../../api-server/src/services/timelineGeneration";

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
    console.error("[timelines] rejected unauthorized background invocation");
    return;
  }

  if (!event.body) {
    console.error("[timelines] background invocation did not include a body");
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(event.body);
  } catch (error) {
    console.error(
      "[timelines] background invocation contained invalid JSON",
      error,
    );
    return;
  }

  const parsed = TimelineGenerationJobSchema.safeParse(payload);
  if (!parsed.success) {
    console.error(
      "[timelines] background invocation contained an invalid job",
      parsed.error.flatten(),
    );
    return;
  }

  await runTimelineGeneration(parsed.data);
};
