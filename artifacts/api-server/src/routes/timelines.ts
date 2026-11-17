import { Router, type IRouter, type Response } from "express";
import {
  db,
  weddingsTable,
  timelinesTable,
  weddingMembersTable,
} from "@workspace/db";
import type { Wedding } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getAuthenticatedUser,
  getAuthorizedWedding,
  getCurrentWeddingForUser,
  getWeddingMembership,
  lockUserPlanChoice,
  type WeddingMembership,
} from "../lib/authorization";
import { isIsoDate } from "../lib/milestoneSchedule";
import {
  getAuthorizedResource,
  requireResourceAccess,
} from "../lib/resourceAccess";
import {
  dispatchTimelineGeneration,
  MAX_TIMELINE_RETRIES,
  recordTimelineGenerationFailure,
  type TimelineGenerationJob,
} from "../services/timelineGeneration";
import { createAiRunId, getRequestId } from "../services/aiTelemetry";
import { logger } from "../lib/logger";
import { z } from "zod";

const router: IRouter = Router();

// ── Validation ────────────────────────────────────────────────────────────────

const GenerateTimelineBody = z.object({
  // Null or left out when the couple hasn't picked a date yet.
  weddingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "weddingDate must be YYYY-MM-DD")
    .refine(isIsoDate, "weddingDate must be a real calendar date")
    .nullable()
    .optional(),
  city: z.string().min(1).max(100),
  guestCount: z.number().int().min(1).max(10000),
  style: z.enum(["intimate", "standard", "large"]),
});

const requireWeddingFromParams = requireResourceAccess<Wedding>({
  resolveId: (req) => req.params["weddingId"],
  lookup: getAuthorizedWedding,
  invalidIdError: "Invalid weddingId",
  notFoundError: "Wedding not found",
});

const requireMembershipFromParams = requireResourceAccess<WeddingMembership>({
  resolveId: (req) => req.params["weddingId"],
  lookup: getWeddingMembership,
  invalidIdError: "Invalid weddingId",
  notFoundError: "Wedding not found",
});

async function sendTimelineState(
  res: Response,
  wedding: Wedding,
): Promise<void> {
  const weddingId = wedding.id;
  const status = wedding.generationStatus;

  if (status === "failed") {
    res.status(200).json({
      status: "failed",
      weddingId,
      retriesRemaining: Math.max(0, MAX_TIMELINE_RETRIES - wedding.retryCount),
      retriesUsed: wedding.retryCount,
      error: wedding.generationError ?? null,
    });
    return;
  }

  if (status === "generating") {
    res.status(202).json({ status: "generating", weddingId });
    return;
  }

  const timelines = await db
    .select()
    .from(timelinesTable)
    .where(eq(timelinesTable.weddingId, weddingId))
    .limit(1);

  if (timelines.length === 0) {
    // Status may be committed just before the timeline row is visible.
    res.status(202).json({ status: "generating", weddingId });
    return;
  }

  res.status(200).json({ status: "ready", timeline: timelines[0], wedding });
}

// ── POST /api/timelines/generate ──────────────────────────────────────────────

router.post("/generate", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;

  const bodyResult = GenerateTimelineBody.safeParse(req.body);
  if (!bodyResult.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: bodyResult.error.flatten() });
    return;
  }
  const { city, guestCount, style } = bodyResult.data;
  const weddingDate = bodyResult.data.weddingDate ?? null;

  // Look up internal user
  const user = await getAuthenticatedUser(clerkUserId);
  if (!user) {
    res
      .status(404)
      .json({ error: "User not found. POST /api/users/me first." });
    return;
  }
  const userId = user.id;

  // One wedding per user, whether they started it or joined their partner's.
  const existing = await getCurrentWeddingForUser(userId);
  if (existing) {
    const status = existing.generationStatus;

    if (status === "ready") {
      const timelines = await db
        .select()
        .from(timelinesTable)
        .where(eq(timelinesTable.weddingId, existing.id))
        .limit(1);
      res.status(200).json({
        weddingId: existing.id,
        status: "ready",
        timeline: timelines[0],
      });
      return;
    }

    // Still generating or failed — return current status
    res.status(202).json({ weddingId: existing.id, status });
    return;
  }

  // The wedding and its owner membership land together, so a plan is never
  // left without anyone who can open it. The per-user lock, shared with
  // joining a partner's plan, stops two requests giving someone two plans.
  const outcome = await db.transaction(async (tx) => {
    await lockUserPlanChoice(tx, userId);
    const raced = await getCurrentWeddingForUser(userId, tx);
    if (raced) return { existing: raced, created: null } as const;

    const [created] = await tx
      .insert(weddingsTable)
      .values({ userId, weddingDate, city, guestCount, style })
      .returning();
    await tx
      .insert(weddingMembersTable)
      .values({ weddingId: created.id, userId, role: "owner" });
    return { existing: null, created } as const;
  });
  if (outcome.existing) {
    res.status(202).json({
      weddingId: outcome.existing.id,
      status: outcome.existing.generationStatus,
    });
    return;
  }
  const wedding = outcome.created;

  const generationJob: TimelineGenerationJob = {
    runId: createAiRunId(),
    requestId: getRequestId(req),
    attempt: 1,
    weddingId: wedding.id,
    weddingDate,
    city,
    guestCount,
    style,
  };

  try {
    await dispatchTimelineGeneration(generationJob);
  } catch (error) {
    await recordTimelineGenerationFailure(generationJob, error, {
      recordTelemetry: true,
    });
    res.status(503).json({
      error: "Timeline generation could not be started. Please retry.",
      weddingId: wedding.id,
      status: "failed",
    });
    return;
  }

  res.status(202).json({ weddingId: wedding.id, status: "generating" });
});

// ── GET /api/timelines/current ───────────────────────────────────────────────
// The MVP supports one current wedding per user: the one they started or the one
// they joined with their partner's code. Resolve it from the authenticated identity
// so device-local state is never the source of truth.

router.get("/current", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;

  const user = await getAuthenticatedUser(clerkUserId);
  if (!user) {
    res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });
    return;
  }

  const wedding = await getCurrentWeddingForUser(user.id);
  if (!wedding) {
    res.status(404).json({ error: "Wedding not found", code: "NO_WEDDING" });
    return;
  }

  await sendTimelineState(res, wedding);
});

// ── POST /api/timelines/:weddingId/retry ──────────────────────────────────────

router.post(
  "/:weddingId/retry",
  requireAuth,
  requireWeddingFromParams,
  async (req, res) => {
    const wedding = getAuthorizedResource<Wedding>(req);
    const weddingId = wedding.id;

    if (wedding.generationStatus !== "failed") {
      res.status(409).json({ error: "Timeline is not in a failed state" });
      return;
    }
    if (wedding.retryCount >= MAX_TIMELINE_RETRIES) {
      logger.warn(
        {
          event: "ai_workflow_retry_rejected",
          workflow: "timeline_generation",
          weddingId,
          requestId: getRequestId(req),
          retriesUsed: wedding.retryCount,
          maxRetries: MAX_TIMELINE_RETRIES,
        },
        "Timeline generation retry limit reached",
      );
      res
        .status(429)
        .json({ error: "Maximum retries reached. Please contact support." });
      return;
    }

    // Reset status, clear the previous error, and increment retry count
    await db
      .update(weddingsTable)
      .set({
        generationStatus: "generating",
        retryCount: wedding.retryCount + 1,
        generationError: null,
      })
      .where(eq(weddingsTable.id, weddingId));

    const generationJob: TimelineGenerationJob = {
      runId: createAiRunId(),
      requestId: getRequestId(req),
      attempt: wedding.retryCount + 2,
      weddingId,
      weddingDate: wedding.weddingDate,
      city: wedding.city,
      guestCount: wedding.guestCount,
      style: wedding.style,
    };

    try {
      await dispatchTimelineGeneration(generationJob);
    } catch (error) {
      await recordTimelineGenerationFailure(generationJob, error, {
        recordTelemetry: true,
      });
      res.status(503).json({
        error: "Timeline generation could not be restarted. Please retry.",
        weddingId,
        status: "failed",
      });
      return;
    }

    res.status(202).json({ weddingId, status: "generating" });
  },
);

// ── DELETE /api/timelines/:weddingId ──────────────────────────────────────────
// Start over: removes the wedding + its timeline so the user can re-onboard.
// This is the escape hatch when retries are exhausted (retryCount >= MAX_RETRIES).
// Only the partner who started the plan can delete it; the other partner can
// leave it instead (DELETE /api/weddings/:weddingId/members/:memberId).

router.delete(
  "/:weddingId",
  requireAuth,
  requireMembershipFromParams,
  async (req, res) => {
    const membership = getAuthorizedResource<WeddingMembership>(req);
    if (membership.role !== "owner") {
      res.status(403).json({
        error:
          "Only the partner who started this plan can delete it. You can leave it instead.",
        code: "OWNER_ONLY",
      });
      return;
    }
    const weddingId = membership.wedding.id;

    // Remove the timeline first (FK), then the wedding.
    await db
      .delete(timelinesTable)
      .where(eq(timelinesTable.weddingId, weddingId));
    await db.delete(weddingsTable).where(eq(weddingsTable.id, weddingId));

    res.status(200).json({ ok: true });
  },
);

// ── GET /api/timelines/:weddingId ─────────────────────────────────────────────

router.get(
  "/:weddingId",
  requireAuth,
  requireWeddingFromParams,
  async (req, res) => {
    const wedding = getAuthorizedResource<Wedding>(req);

    await sendTimelineState(res, wedding);
  },
);

export default router;
