import { Router, type IRouter } from "express";
import { db, usersTable, weddingsTable, timelinesTable } from "@workspace/db";
import type { TimelineWeek } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

// ── Validation ────────────────────────────────────────────────────────────────

const GenerateTimelineBody = z.object({
  weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weddingDate must be YYYY-MM-DD"),
  city: z.string().min(1).max(100),
  guestCount: z.number().int().min(1).max(10000),
  style: z.enum(["intimate", "standard", "large"]),
});

// ── System prompt (kept tight — under 300 tokens) ────────────────────────────

function buildSystemPrompt(): string {
  return `You are a wedding planning assistant. Return ONLY valid JSON with no prose.
Output a JSON object: { "weeks": [...] }
Each week: { "weekLabel": string, "phase": string, "tasks": [{ "title": string, "priority": "urgent"|"this-week"|"upcoming" }] }
phases: "12+ months out" | "6–12 months out" | "3–6 months out" | "final month"
Rules: 2–4 tasks per week. weekLabel format: "Week of [Month Day]" relative to wedding. Cover full planning arc from today to wedding day. No prose, no markdown, only JSON.`;
}

function buildUserPrompt(weddingDate: string, city: string, guestCount: number, style: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `Wedding: ${weddingDate} in ${city}. Guests: ${guestCount}. Style: ${style}. Today: ${today}. Generate the full week-by-week timeline.`;
}

// ── Background LLM generation ─────────────────────────────────────────────────

async function generateAndStore(weddingId: number, weddingDate: string, city: string, guestCount: number, style: string) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      response_format: { type: "json_object" },
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(weddingDate, city, guestCount, style) },
      ],
    });

    const usage = completion.usage;
    console.log(`[timelines] tokens used — prompt: ${usage?.prompt_tokens}, completion: ${usage?.completion_tokens}, total: ${usage?.total_tokens}`);

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { weeks?: TimelineWeek[] };
    const weeks: TimelineWeek[] = parsed.weeks ?? [];

    await db.insert(timelinesTable).values({
      weddingId,
      tasks: weeks,
    });
  } catch (err) {
    console.error("[timelines] generation failed for wedding", weddingId, err);
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
  const users = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkUserId)).limit(1);
  if (users.length === 0) {
    res.status(404).json({ error: "User not found. POST /api/users/me first." });
    return;
  }
  const userId = users[0].id;

  // Rate limit: one timeline per user — check for existing wedding + timeline
  const existingWeddings = await db.select().from(weddingsTable).where(eq(weddingsTable.userId, userId)).limit(1);
  if (existingWeddings.length > 0) {
    const existingWedding = existingWeddings[0];
    const existingTimelines = await db
      .select()
      .from(timelinesTable)
      .where(eq(timelinesTable.weddingId, existingWedding.id))
      .limit(1);

    if (existingTimelines.length > 0) {
      // Already generated — return cached data
      res.status(200).json({ weddingId: existingWedding.id, status: "ready", timeline: existingTimelines[0] });
      return;
    }

    // Wedding exists but timeline still generating
    res.status(202).json({ weddingId: existingWedding.id, status: "generating" });
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

// ── GET /api/timelines/:weddingId ─────────────────────────────────────────────

router.get("/:weddingId", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  const weddingId = parseInt(req.params["weddingId"] as string, 10);

  if (isNaN(weddingId)) {
    res.status(400).json({ error: "Invalid weddingId" });
    return;
  }

  // Verify ownership
  const users = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkUserId)).limit(1);
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const weddings = await db
    .select()
    .from(weddingsTable)
    .where(eq(weddingsTable.id, weddingId))
    .limit(1);

  if (weddings.length === 0 || weddings[0].userId !== users[0].id) {
    res.status(404).json({ error: "Wedding not found" });
    return;
  }

  const timelines = await db
    .select()
    .from(timelinesTable)
    .where(eq(timelinesTable.weddingId, weddingId))
    .limit(1);

  if (timelines.length === 0) {
    res.status(202).json({ status: "generating" });
    return;
  }

  res.json({ status: "ready", timeline: timelines[0], wedding: weddings[0] });
});

export default router;
