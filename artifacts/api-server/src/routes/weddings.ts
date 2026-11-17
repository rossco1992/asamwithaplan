import { Router, type IRouter } from "express";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  usersTable,
  weddingInvitesTable,
  weddingMembersTable,
  weddingsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getWeddingMembership,
  type WeddingMembership,
} from "../lib/authorization";
import {
  getAuthorizedResource,
  requireResourceAccess,
} from "../lib/resourceAccess";
import { isIsoDate } from "../lib/milestoneSchedule";
import {
  INVITE_LIFETIME_MS,
  formatInviteCode,
  generateInviteCode,
  hashInviteCode,
} from "../lib/inviteCodes";

const router: IRouter = Router();

/** The couple: the partner who started the plan and the one who joined. */
const MAX_MEMBERS = 2;

const requireMembership = requireResourceAccess<WeddingMembership>({
  resolveId: (req) => req.params["weddingId"],
  lookup: getWeddingMembership,
  invalidIdError: "Invalid weddingId",
  notFoundError: "Wedding not found",
});

const UpdateWeddingBody = z
  .object({
    weddingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD")
      .refine(isIsoDate, "Dates must be real calendar dates as YYYY-MM-DD")
      .nullable(),
  })
  .strict();

async function loadMembers(weddingId: number) {
  return db
    .select({
      id: weddingMembersTable.id,
      userId: weddingMembersTable.userId,
      role: weddingMembersTable.role,
      firstName: usersTable.firstName,
      joinedAt: weddingMembersTable.joinedAt,
    })
    .from(weddingMembersTable)
    .innerJoin(usersTable, eq(weddingMembersTable.userId, usersTable.id))
    .where(eq(weddingMembersTable.weddingId, weddingId))
    .orderBy(asc(weddingMembersTable.joinedAt), asc(weddingMembersTable.id));
}

// ── PATCH /api/weddings/:weddingId ────────────────────────────────────────────
// Either partner can set, change or clear the date. Milestones are stored
// relative to the date, so the journey moves with it; the app shows
// POST /milestones/date-preview first so the couple sees what will move.

router.patch("/:weddingId", requireAuth, requireMembership, async (req, res) => {
  const { wedding } = getAuthorizedResource<WeddingMembership>(req);
  const parsed = UpdateWeddingBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const [updated] = await db
    .update(weddingsTable)
    .set({ weddingDate: parsed.data.weddingDate })
    .where(eq(weddingsTable.id, wedding.id))
    .returning();

  res.json({ wedding: updated ?? { ...wedding, ...parsed.data } });
});

// ── GET /api/weddings/:weddingId/members ──────────────────────────────────────

router.get(
  "/:weddingId/members",
  requireAuth,
  requireMembership,
  async (req, res) => {
    const membership = getAuthorizedResource<WeddingMembership>(req);
    const weddingId = membership.wedding.id;
    const members = await loadMembers(weddingId);
    const pending = await db
      .select({ expiresAt: weddingInvitesTable.expiresAt })
      .from(weddingInvitesTable)
      .where(
        and(
          eq(weddingInvitesTable.weddingId, weddingId),
          isNull(weddingInvitesTable.usedAt),
          gt(weddingInvitesTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    res.json({
      members: members.map((member) => ({
        id: member.id,
        role: member.role,
        firstName: member.firstName,
        isYou: member.userId === membership.userId,
        joinedAt: member.joinedAt,
      })),
      canInvite: members.length < MAX_MEMBERS,
      pendingInvite: pending[0] ? { expiresAt: pending[0].expiresAt } : null,
    });
  },
);

// ── POST /api/weddings/:weddingId/invites ─────────────────────────────────────
// Makes a single-use code for the other partner. The couple shares it
// themselves (the app opens the phone's share sheet); nothing is sent for them.
// A new code replaces any earlier unused one, so only one works at a time.

router.post(
  "/:weddingId/invites",
  requireAuth,
  requireMembership,
  async (req, res) => {
    const membership = getAuthorizedResource<WeddingMembership>(req);
    const weddingId = membership.wedding.id;

    const members = await loadMembers(weddingId);
    if (members.length >= MAX_MEMBERS) {
      res.status(409).json({
        error: "Your partner has already joined this plan.",
        code: "PARTNER_ALREADY_JOINED",
      });
      return;
    }

    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);
    await db.transaction(async (tx) => {
      await tx
        .delete(weddingInvitesTable)
        .where(
          and(
            eq(weddingInvitesTable.weddingId, weddingId),
            isNull(weddingInvitesTable.usedAt),
          ),
        );
      await tx.insert(weddingInvitesTable).values({
        weddingId,
        codeHash: hashInviteCode(code),
        createdByUserId: membership.userId,
        expiresAt,
      });
    });

    res.status(201).json({ code: formatInviteCode(code), expiresAt });
  },
);

// ── DELETE /api/weddings/:weddingId/invites ───────────────────────────────────
// Cancels the unused code, for example if it went to the wrong person.

router.delete(
  "/:weddingId/invites",
  requireAuth,
  requireMembership,
  async (req, res) => {
    const weddingId = getAuthorizedResource<WeddingMembership>(req).wedding.id;
    await db
      .delete(weddingInvitesTable)
      .where(
        and(
          eq(weddingInvitesTable.weddingId, weddingId),
          isNull(weddingInvitesTable.usedAt),
        ),
      );
    res.json({ ok: true });
  },
);

// ── DELETE /api/weddings/:weddingId/members/:memberId ─────────────────────────
// The partner who started the plan can remove the other partner, and the
// partner who joined can leave. The plan itself always keeps its owner.

router.delete(
  "/:weddingId/members/:memberId",
  requireAuth,
  requireMembership,
  async (req, res) => {
    const membership = getAuthorizedResource<WeddingMembership>(req);
    const memberId = Number(req.params["memberId"]);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
      res.status(400).json({ error: "Invalid memberId" });
      return;
    }

    const [target] = await db
      .select()
      .from(weddingMembersTable)
      .where(
        and(
          eq(weddingMembersTable.id, memberId),
          eq(weddingMembersTable.weddingId, membership.wedding.id),
        ),
      )
      .limit(1);

    const isSelf = target?.userId === membership.userId;
    if (!target || (!isSelf && membership.role !== "owner")) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (target.role === "owner") {
      res.status(409).json({
        error:
          "The partner who started the plan can't leave it. Delete the plan instead.",
        code: "OWNER_CANNOT_LEAVE",
      });
      return;
    }

    await db
      .delete(weddingMembersTable)
      .where(eq(weddingMembersTable.id, target.id));
    res.json({ ok: true });
  },
);

export default router;
