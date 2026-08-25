import { Router, type IRouter, type Response } from "express";
import { db, weddingsTable, timelinesTable } from "@workspace/db";
import type { Wedding } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getAuthenticatedUser,
  getAuthorizedWedding,
} from "../lib/authorization";
import {
  getAuthorizedResource,
  requireResourceAccess,
} from "../lib/resourceAccess";
import {
  dispatchTimelineGeneration,
  recordTimelineGenerationFailure,
  type TimelineGenerationJob,
} from "../services/timelineGeneration";
import { z } from "zod";

const router: IRouter = Router();

const MAX_RETRIES = 10;

// ── Validation ────────────────────────────────────────────────────────────────

const GenerateTimelineBody = z.object({
  weddingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "weddingDate must be YYYY-MM-DD"),
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
      retriesRemaining: MAX_RETRIES - wedding.retryCount,
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
  const { weddingDate, city, guestCount, style } = bodyResult.data;

  // Look up internal user
  const user = await getAuthenticatedUser(clerkUserId);
  if (!user) {
    res
      .status(404)
      .json({ error: "User not found. POST /api/users/me first." });
    return;
  }
  const userId = user.id;

  // One wedding per user — check for existing
  const existingWeddings = await db
    .select()
    .from(weddingsTable)
    .where(eq(weddingsTable.userId, userId))
    .orderBy(desc(weddingsTable.createdAt), desc(weddingsTable.id))
    .limit(1);
  if (existingWeddings.length > 0) {
    const existing = existingWeddings[0];
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

  // Insert wedding record
  const [wedding] = await db
    .insert(weddingsTable)
    .values({ userId, weddingDate, city, guestCount, style })
    .returning();

  const generationJob: TimelineGenerationJob = {
    weddingId: wedding.id,
    weddingDate,
    city,
    guestCount,
    style,
  };

  try {
    await dispatchTimelineGeneration(generationJob);
  } catch (error) {
    await recordTimelineGenerationFailure(wedding.id, error);
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
// The MVP supports one current wedding per user. Resolve it from the authenticated
// identity so browser-local state is never the source of truth. Ordering keeps the
// behavior deterministic if legacy data contains more than one wedding row.

router.get("/current", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;

  const user = await getAuthenticatedUser(clerkUserId);
  if (!user) {
    res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });
    return;
  }

  const weddings = await db
    .select()
    .from(weddingsTable)
    .where(eq(weddingsTable.userId, user.id))
    .orderBy(desc(weddingsTable.createdAt), desc(weddingsTable.id))
    .limit(1);

  if (weddings.length === 0) {
    res.status(404).json({ error: "Wedding not found", code: "NO_WEDDING" });
    return;
  }

  await sendTimelineState(res, weddings[0]);
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
    if (wedding.retryCount >= MAX_RETRIES) {
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

    try {
      await dispatchTimelineGeneration({
        weddingId,
        weddingDate: wedding.weddingDate,
        city: wedding.city,
        guestCount: wedding.guestCount,
        style: wedding.style,
      });
    } catch (error) {
      await recordTimelineGenerationFailure(weddingId, error);
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

router.delete(
  "/:weddingId",
  requireAuth,
  requireWeddingFromParams,
  async (req, res) => {
    const weddingId = getAuthorizedResource<Wedding>(req).id;

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
