import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getAuthenticatedUser } from "../lib/authorization";

const router: IRouter = Router();

// The app sends the first name from the signed-in profile so the other
// partner sees who joined and the map can show the couple's initials.
const ProvisionBody = z
  .object({ firstName: z.string().trim().min(1).max(40).optional() })
  .passthrough();

/**
 * POST /api/users/me
 * JIT-provisions a DB user row on first authenticated request.
 * Idempotent — safe to call on every app load. Also keeps the first name
 * current when the app sends one.
 */
router.post("/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  const auth = getAuth(req);

  const parsedBody = ProvisionBody.safeParse(req.body ?? {});
  const firstName = parsedBody.success ? parsedBody.data.firstName : undefined;

  try {
    // Try to find existing user
    const existing = await getAuthenticatedUser(clerkUserId);

    if (existing) {
      if (firstName && firstName !== existing.firstName) {
        const [updated] = await db
          .update(usersTable)
          .set({ firstName })
          .where(eq(usersTable.id, existing.id))
          .returning();
        res.json(updated ?? { ...existing, firstName });
        return;
      }
      res.json(existing);
      return;
    }

    // Extract email from Clerk session claims
    const email =
      (auth?.sessionClaims?.email as string) ||
      (auth?.sessionClaims?.primary_email_address as string) ||
      "";

    const [newUser] = await db
      .insert(usersTable)
      .values({ clerkId: clerkUserId, email, ...(firstName ? { firstName } : {}) })
      .returning();

    res.status(201).json(newUser);
  } catch (err) {
    console.error("Error provisioning user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/users/me
 * Returns the current authenticated user's DB record.
 */
router.get("/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;

  try {
    const user = await getAuthenticatedUser(clerkUserId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
