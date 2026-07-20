import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * POST /api/users/me
 * JIT-provisions a DB user row on first authenticated request.
 * Idempotent — safe to call on every app load.
 */
router.post("/me", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  const auth = getAuth(req);

  try {
    // Try to find existing user
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkUserId))
      .limit(1);

    if (existing.length > 0) {
      res.json(existing[0]);
      return;
    }

    // Extract email from Clerk session claims
    const email =
      (auth?.sessionClaims?.email as string) ||
      (auth?.sessionClaims?.primary_email_address as string) ||
      "";

    const [newUser] = await db
      .insert(usersTable)
      .values({ clerkId: clerkUserId, email })
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
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkUserId))
      .limit(1);

    if (users.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(users[0]);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
