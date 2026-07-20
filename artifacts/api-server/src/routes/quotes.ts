import { Router, type IRouter } from "express";
import { db, usersTable, weddingsTable, quotesTable, vendorCategories } from "@workspace/db";
import type { QuoteLineItem } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

// ── Validation ────────────────────────────────────────────────────────────────

const CreateQuoteBody = z.object({
  weddingId: z.number().int().positive(),
  vendorName: z.string().min(1).max(200),
  category: z.enum(vendorCategories),
  rawText: z.string().min(10).max(20000),
});

// ── AI parsing ────────────────────────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `You are a wedding vendor quote parser. Extract all line items from the quote text provided and return ONLY valid JSON.

Output format:
{
  "currency": "USD",
  "lineItems": [
    { "item": "string", "quantity": number, "unitPrice": number, "total": number }
  ],
  "totalAmount": number
}

Rules:
- currency: detect the currency symbol/code (USD, GBP, EUR, etc.). Default to "USD".
- unitPrice and total are plain numbers (no currency symbols).
- If quantity is not stated, use 1.
- If only a total is stated for a line, set unitPrice = total, quantity = 1.
- totalAmount is the sum of all line item totals (or the grand total if explicitly stated).
- Do not include taxes/gratuity as separate line items unless explicitly broken out.
- No prose, no markdown, only JSON.`;

async function parseQuoteWithAI(rawText: string): Promise<{
  currency: string;
  lineItems: QuoteLineItem[];
  totalAmount: number;
}> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5-nano",
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: PARSE_SYSTEM_PROMPT },
      { role: "user", content: `Parse this vendor quote:\n\n${rawText}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    currency?: string;
    lineItems?: QuoteLineItem[];
    totalAmount?: number;
  };

  const lineItems: QuoteLineItem[] = (parsed.lineItems ?? []).map((li) => ({
    item: String(li.item ?? ""),
    quantity: Number(li.quantity ?? 1),
    unitPrice: Number(li.unitPrice ?? 0),
    total: Number(li.total ?? 0),
  }));

  const totalAmount =
    Number(parsed.totalAmount) ||
    lineItems.reduce((sum, li) => sum + li.total, 0);

  return {
    currency: parsed.currency ?? "USD",
    lineItems,
    totalAmount,
  };
}

// ── Helper: verify wedding ownership ─────────────────────────────────────────

async function getVerifiedWedding(clerkUserId: string, weddingId: number) {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId))
    .limit(1);
  if (users.length === 0) return null;

  const weddings = await db
    .select()
    .from(weddingsTable)
    .where(and(eq(weddingsTable.id, weddingId), eq(weddingsTable.userId, users[0].id)))
    .limit(1);

  return weddings.length > 0 ? weddings[0] : null;
}

// ── POST /api/quotes ──────────────────────────────────────────────────────────

router.post("/", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;

  const bodyResult = CreateQuoteBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "Invalid input", details: bodyResult.error.flatten() });
    return;
  }
  const { weddingId, vendorName, category, rawText } = bodyResult.data;

  const wedding = await getVerifiedWedding(clerkUserId, weddingId);
  if (!wedding) {
    res.status(404).json({ error: "Wedding not found" });
    return;
  }

  let parsed: Awaited<ReturnType<typeof parseQuoteWithAI>>;
  try {
    parsed = await parseQuoteWithAI(rawText);
  } catch (err) {
    console.error("[quotes] AI parsing failed", err);
    res.status(502).json({ error: "Failed to parse quote. Please try again." });
    return;
  }

  const [quote] = await db
    .insert(quotesTable)
    .values({
      weddingId,
      vendorName,
      category,
      rawText,
      lineItems: parsed.lineItems,
      totalAmount: parsed.totalAmount,
      currency: parsed.currency,
    })
    .returning();

  res.status(201).json({ quote });
});

// ── GET /api/quotes?weddingId=:id ─────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  const weddingId = parseInt(req.query["weddingId"] as string, 10);

  if (isNaN(weddingId)) {
    res.status(400).json({ error: "weddingId query param required" });
    return;
  }

  const wedding = await getVerifiedWedding(clerkUserId, weddingId);
  if (!wedding) {
    res.status(404).json({ error: "Wedding not found" });
    return;
  }

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.weddingId, weddingId))
    .orderBy(quotesTable.createdAt);

  res.json({ quotes });
});

// ── DELETE /api/quotes/:id ────────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  const quoteId = parseInt(req.params["id"] as string, 10);

  if (isNaN(quoteId)) {
    res.status(400).json({ error: "Invalid quote id" });
    return;
  }

  // Verify ownership via the wedding
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId))
    .limit(1);
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const existing = await db
    .select({ id: quotesTable.id, weddingId: quotesTable.weddingId })
    .from(quotesTable)
    .where(eq(quotesTable.id, quoteId))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  // Verify the quote's wedding belongs to the user
  const weddings = await db
    .select()
    .from(weddingsTable)
    .where(
      and(
        eq(weddingsTable.id, existing[0].weddingId),
        eq(weddingsTable.userId, users[0].id)
      )
    )
    .limit(1);

  if (weddings.length === 0) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(quotesTable).where(eq(quotesTable.id, quoteId));
  res.status(204).end();
});

export default router;
