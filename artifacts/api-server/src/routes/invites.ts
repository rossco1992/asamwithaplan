import { Router, type IRouter } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, weddingInvitesTable, weddingMembersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getAuthenticatedUser,
  getCurrentWeddingForUser,
} from "../lib/authorization";
import {
  AttemptLimiter,
  hashInviteCode,
  normalizeInviteCode,
} from "../lib/inviteCodes";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Five wrong codes in 15 minutes pauses that person's tries. */
export const inviteAttempts = new AttemptLimiter(5, 15 * 60 * 1000);

const AcceptInviteBody = z.object({ code: z.string().min(1).max(32) }).strict();

const CODE_DIDNT_WORK = {
  error:
    "That code didn't work. Check it with your partner, or ask them for a new one.",
  code: "INVITE_INVALID",
};

class PartnerSlotTaken extends Error {}

// ── POST /api/invites/accept ──────────────────────────────────────────────────
// The partner who received a code joins the plan. Wrong, used and expired
// codes all get the same answer, so a guess learns nothing.

router.post("/accept", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  const parsed = AcceptInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the code your partner shared." });
    return;
  }

  const user = await getAuthenticatedUser(clerkUserId);
  if (!user) {
    res
      .status(404)
      .json({ error: "User not found. POST /api/users/me first." });
    return;
  }

  const limitKey = `user:${user.id}`;
  if (inviteAttempts.isBlocked(limitKey)) {
    res.status(429).json({
      error: "Too many tries. Wait a few minutes, then try again.",
      code: "INVITE_RATE_LIMITED",
    });
    return;
  }

  const code = normalizeInviteCode(parsed.data.code);
  const [invite] = code
    ? await db
        .select()
        .from(weddingInvitesTable)
        .where(
          and(
            eq(weddingInvitesTable.codeHash, hashInviteCode(code)),
            isNull(weddingInvitesTable.usedAt),
            gt(weddingInvitesTable.expiresAt, new Date()),
          ),
        )
        .limit(1)
    : [];

  if (!invite) {
    inviteAttempts.recordFailure(limitKey);
    logger.info(
      { event: "wedding_invite_rejected", userId: user.id },
      "Invite code did not match a live invite",
    );
    res.status(404).json(CODE_DIDNT_WORK);
    return;
  }

  const current = await getCurrentWeddingForUser(user.id);
  if (current?.id === invite.weddingId) {
    res.json({ weddingId: invite.weddingId });
    return;
  }
  if (current) {
    res.status(409).json({
      error:
        "You already have a wedding plan. Delete it first if you'd rather join your partner's.",
      code: "ALREADY_PLANNING",
    });
    return;
  }

  try {
    const joined = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(weddingInvitesTable)
        .set({ usedAt: new Date(), usedByUserId: user.id })
        .where(
          and(
            eq(weddingInvitesTable.id, invite.id),
            isNull(weddingInvitesTable.usedAt),
          ),
        )
        .returning();
      if (claimed.length === 0) return false;

      const added = await tx
        .insert(weddingMembersTable)
        .values({ weddingId: invite.weddingId, userId: user.id, role: "partner" })
        .onConflictDoNothing()
        .returning();
      // The unique (wedding, role) index allows one partner; roll the claim back.
      if (added.length === 0) throw new PartnerSlotTaken();
      return true;
    });

    if (!joined) {
      res.status(404).json(CODE_DIDNT_WORK);
      return;
    }
  } catch (error) {
    if (error instanceof PartnerSlotTaken) {
      res.status(409).json({
        error: "Two partners have already joined this plan.",
        code: "PARTNER_ALREADY_JOINED",
      });
      return;
    }
    throw error;
  }

  inviteAttempts.clear(limitKey);
  res.json({ weddingId: invite.weddingId });
});

export default router;
