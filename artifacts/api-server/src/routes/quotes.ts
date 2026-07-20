import { Router, type IRouter } from "express";
import { db, usersTable, weddingsTable, quotesTable, vendorCategories } from "@workspace/db";
import type { QuoteLineItem } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod";
import multer from "multer";
// Import from the lib path to avoid pdf-parse's top-level test-mode side effect
// that tries to read a local test file when `module.parent` is falsy (always true
// in a bundled ESM entry point).
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const router: IRouter = Router();

// ── Multer (memory storage — PDFs not persisted) ──────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted"));
    }
  },
});

// ── Validation ────────────────────────────────────────────────────────────────

const CreateQuoteBody = z.object({
  weddingId: z.coerce.number().int().positive(),
  vendorName: z.string().min(1).max(200),
  category: z.enum(vendorCategories),
  rawText: z.string().min(10).max(20000).optional(),
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

// Wrap multer so file-filter/size errors become consistent JSON 4xx responses
function uploadSingle(fieldName: string) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next();
      const multerError = err as import("multer").MulterError;
      if (multerError.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "PDF exceeds the 10 MB limit. Please reduce the file size and try again." });
      } else if (err instanceof Error && err.message === "Only PDF files are accepted") {
        res.status(415).json({ error: "Only PDF files are accepted. Please upload a .pdf file." });
      } else {
        next(err);
      }
    });
  };
}

router.post(
  "/",
  requireAuth,
  // Accept optional PDF upload; field name = "pdf"
  uploadSingle("pdf"),
  async (req, res) => {
    const clerkUserId = (req as any).clerkUserId as string;

    const bodyResult = CreateQuoteBody.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: "Invalid input", details: bodyResult.error.flatten() });
      return;
    }
    const { weddingId, vendorName, category, rawText: rawTextBody } = bodyResult.data;

    // Determine raw text: PDF upload takes priority over pasted text
    let rawText: string;
    if (req.file) {
      try {
        const pdfData = await pdfParse(req.file.buffer);
        rawText = pdfData.text.trim();
        if (!rawText || rawText.length < 10) {
          res.status(422).json({ error: "Could not extract readable text from this PDF. Try pasting the quote text instead." });
          return;
        }
      } catch (err) {
        console.error("[quotes] PDF extraction failed", err);
        res.status(422).json({ error: "Failed to read PDF. Make sure it is a text-based PDF, not a scanned image." });
        return;
      }
    } else if (rawTextBody && rawTextBody.length >= 10) {
      rawText = rawTextBody;
    } else {
      res.status(400).json({ error: "Provide either a PDF file or pasted quote text (at least 10 characters)." });
      return;
    }

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
  },
);

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

// ── PATCH /api/quotes/:id/select ─────────────────────────────────────────────
// Toggles the selectedAt timestamp on a quote. Only one quote per category can
// be selected at a time — selecting a new one clears any existing selection in
// the same category.

router.patch("/:id/select", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  const quoteId = parseInt(req.params["id"] as string, 10);

  if (isNaN(quoteId)) {
    res.status(400).json({ error: "Invalid quote id" });
    return;
  }

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
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, quoteId))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  const quote = existing[0];

  const weddings = await db
    .select()
    .from(weddingsTable)
    .where(
      and(
        eq(weddingsTable.id, quote.weddingId),
        eq(weddingsTable.userId, users[0].id)
      )
    )
    .limit(1);

  if (weddings.length === 0) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Toggle: if already selected, deselect; otherwise select (and clear others in same category)
  const isSelected = quote.selectedAt !== null;

  if (isSelected) {
    // Deselect
    const [updated] = await db
      .update(quotesTable)
      .set({ selectedAt: null })
      .where(eq(quotesTable.id, quoteId))
      .returning();
    res.json({ quote: updated });
  } else {
    // Clear any existing selection in the same category for this wedding
    await db
      .update(quotesTable)
      .set({ selectedAt: null })
      .where(
        and(
          eq(quotesTable.weddingId, quote.weddingId),
          eq(quotesTable.category, quote.category)
        )
      );
    // Select this quote
    const [updated] = await db
      .update(quotesTable)
      .set({ selectedAt: new Date() })
      .where(eq(quotesTable.id, quoteId))
      .returning();
    res.json({ quote: updated });
  }
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
