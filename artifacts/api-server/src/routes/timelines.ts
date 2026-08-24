import { Router, type IRouter, type Response } from "express";
import { db, weddingsTable, timelinesTable } from "@workspace/db";
import type { TimelineWeek, Wedding } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
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
import { z } from "zod";

const router: IRouter = Router();

const MAX_RETRIES = 10;

// ── Validation ────────────────────────────────────────────────────────────────

const GenerateTimelineBody = z.object({
  weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weddingDate must be YYYY-MM-DD"),
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

async function sendTimelineState(res: Response, wedding: Wedding): Promise<void> {
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

// ── System prompt (kept tight — under 300 tokens) ────────────────────────────

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

function buildUserPrompt(weddingDate: string, city: string, guestCount: number, style: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `Wedding: ${weddingDate} in ${city}. Guests: ${guestCount}. Style: ${style}. Today: ${today}. Generate a concise timeline — max 24 entries, 2–3 tasks each. Keep it short enough that the full JSON fits in your response.`;
}

// ── Background LLM generation ─────────────────────────────────────────────────

async function generateAndStore(weddingId: number, weddingDate: string, city: string, guestCount: number, style: string) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      response_format: { type: "json_object" },
      // gpt-5-nano is a reasoning model: max_completion_tokens must cover the
      // hidden reasoning tokens AND the visible JSON. Keeping reasoning minimal
      // (this is a deterministic formatting task) plus a generous ceiling leaves
      // plenty of room for the full timeline, avoiding finish_reason=length.
      reasoning_effort: "minimal",
      max_completion_tokens: 8000,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(weddingDate, city, guestCount, style) },
      ],
    });

    const usage = completion.usage;
    console.log(`[timelines] tokens — prompt: ${usage?.prompt_tokens}, completion: ${usage?.completion_tokens}, total: ${usage?.total_tokens}`);

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const finishReason = completion.choices[0]?.finish_reason;
    if (finishReason === "length") {
      console.error(`[timelines] output truncated (finish_reason=length) for wedding ${weddingId} — prompt tightening needed`);
      throw new Error("Model output was truncated — reduce max_completion_tokens or prompt size");
    }
    const parsed = JSON.parse(raw) as { weeks?: TimelineWeek[] };
    const weeks: TimelineWeek[] = parsed.weeks ?? [];

    // Delete any existing timeline row (retry path), then insert fresh
    await db.delete(timelinesTable).where(eq(timelinesTable.weddingId, weddingId));
    await db.insert(timelinesTable).values({ weddingId, tasks: weeks });

    await db
      .update(weddingsTable)
      .set({ generationStatus: "ready", generationError: null })
      .where(eq(weddingsTable.id, weddingId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // OpenAI SDK errors carry extra context (status, code, type) worth logging.
    const status = (err as any)?.status;
    const code = (err as any)?.code;
    console.error(
      `[timelines] generation failed for wedding ${weddingId}`,
      { message, status, code },
      err,
    );
    const detail = [status && `HTTP ${status}`, code, message].filter(Boolean).join(" · ");
    await db
      .update(weddingsTable)
      .set({ generationStatus: "failed", generationError: detail })
      .where(eq(weddingsTable.id, weddingId))
      .catch((dbErr) => console.error("[timelines] failed to write failed status", weddingId, dbErr));
  }
}

// ── POST /api/timelines/generate ──────────────────────────────────────────────

router.post("/generate", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;

  const bodyResult = GenerateTimelineBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "Invalid input", details: bodyResult.error.flatten() });
    return;
  }
  const { weddingDate, city, guestCount, style } = bodyResult.data;

  // Look up internal user
  const user = await getAuthenticatedUser(clerkUserId);
  if (!user) {
    res.status(404).json({ error: "User not found. POST /api/users/me first." });
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
      const timelines = await db.select().from(timelinesTable).where(eq(timelinesTable.weddingId, existing.id)).limit(1);
      res.status(200).json({ weddingId: existing.id, status: "ready", timeline: timelines[0] });
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

  // Fire-and-forget LLM generation
  generateAndStore(wedding.id, weddingDate, city, guestCount, style);

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

router.post("/:weddingId/retry", requireAuth, requireWeddingFromParams, async (req, res) => {
  const wedding = getAuthorizedResource<Wedding>(req);
  const weddingId = wedding.id;

  if (wedding.generationStatus !== "failed") {
    res.status(409).json({ error: "Timeline is not in a failed state" });
    return;
  }
  if (wedding.retryCount >= MAX_RETRIES) {
    res.status(429).json({ error: "Maximum retries reached. Please contact support." });
    return;
  }

  // Reset status, clear the previous error, and increment retry count
  await db
    .update(weddingsTable)
    .set({ generationStatus: "generating", retryCount: wedding.retryCount + 1, generationError: null })
    .where(eq(weddingsTable.id, weddingId));

  // Fire-and-forget retry
  generateAndStore(weddingId, wedding.weddingDate, wedding.city, wedding.guestCount, wedding.style);

  res.status(202).json({ weddingId, status: "generating" });
});

// ── DELETE /api/timelines/:weddingId ──────────────────────────────────────────
// Start over: removes the wedding + its timeline so the user can re-onboard.
// This is the escape hatch when retries are exhausted (retryCount >= MAX_RETRIES).

router.delete("/:weddingId", requireAuth, requireWeddingFromParams, async (req, res) => {
  const weddingId = getAuthorizedResource<Wedding>(req).id;

  // Remove the timeline first (FK), then the wedding.
  await db.delete(timelinesTable).where(eq(timelinesTable.weddingId, weddingId));
  await db.delete(weddingsTable).where(eq(weddingsTable.id, weddingId));

  res.status(200).json({ ok: true });
});

// ── GET /api/timelines/:weddingId ─────────────────────────────────────────────

router.get("/:weddingId", requireAuth, requireWeddingFromParams, async (req, res) => {
  const wedding = getAuthorizedResource<Wedding>(req);

  await sendTimelineState(res, wedding);
});

export default router;
