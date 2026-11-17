import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import {
  db,
  quotesTable,
  usersTable,
  weddingMembersTable,
  weddingsTable,
  type Quote,
  type User,
  type Wedding,
  type WeddingMemberRole,
} from "@workspace/db";

/**
 * Wedding-scoped access goes through `wedding_members`: the partner who
 * created the plan and the partner who joined with an invite code have the
 * same access to everything in it. Keep every check behind these helpers so
 * no route implements its own access rules.
 *
 * The creator (`weddings.user_id`) is always treated as the owner too, so a
 * database whose owner rows were never backfilled can't lock anyone out of a
 * plan they started.
 */

type Executor = Pick<typeof db, "select">;

export async function getAuthenticatedUser(
  clerkUserId: string,
): Promise<User | null> {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId))
    .limit(1);

  return users[0] ?? null;
}

export interface WeddingMembership {
  wedding: Wedding;
  role: WeddingMemberRole;
  userId: number;
}

/** The wedding and the caller's place in it, or null when they aren't a member. */
export async function getWeddingMembership(
  clerkUserId: string,
  weddingId: number,
): Promise<WeddingMembership | null> {
  const rows = await db
    .select({
      wedding: weddingsTable,
      memberRole: weddingMembersTable.role,
      userId: usersTable.id,
    })
    .from(weddingsTable)
    .innerJoin(usersTable, eq(usersTable.clerkId, clerkUserId))
    .leftJoin(
      weddingMembersTable,
      and(
        eq(weddingMembersTable.weddingId, weddingsTable.id),
        eq(weddingMembersTable.userId, usersTable.id),
      ),
    )
    .where(
      and(
        eq(weddingsTable.id, weddingId),
        or(
          isNotNull(weddingMembersTable.id),
          eq(weddingsTable.userId, usersTable.id),
        ),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const role: WeddingMemberRole =
    row.wedding.userId === row.userId ? "owner" : (row.memberRole ?? "partner");
  return { wedding: row.wedding, role, userId: row.userId };
}

export async function getAuthorizedWedding(
  clerkUserId: string,
  weddingId: number,
): Promise<Wedding | null> {
  return (await getWeddingMembership(clerkUserId, weddingId))?.wedding ?? null;
}

/**
 * The wedding a user is planning. MVP 1 has one per user; ordering keeps the
 * answer stable if legacy data holds more than one.
 */
export async function getCurrentWeddingForUser(
  userId: number,
  executor: Executor = db,
): Promise<Wedding | null> {
  const rows = await executor
    .select({ wedding: weddingsTable })
    .from(weddingsTable)
    .leftJoin(
      weddingMembersTable,
      and(
        eq(weddingMembersTable.weddingId, weddingsTable.id),
        eq(weddingMembersTable.userId, userId),
      ),
    )
    .where(
      or(isNotNull(weddingMembersTable.id), eq(weddingsTable.userId, userId)),
    )
    .orderBy(desc(weddingsTable.createdAt), desc(weddingsTable.id))
    .limit(1);

  return rows[0]?.wedding ?? null;
}

/** Namespace for the per-user advisory lock below. */
const PLAN_CHOICE_LOCK = 7_041_917;

/**
 * Serializes "which plan is this person in?" decisions for one user, so two
 * requests can't each put them in a different wedding. Call inside a
 * transaction; the lock is released when it ends.
 */
export async function lockUserPlanChoice(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  userId: number,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${PLAN_CHOICE_LOCK}::int, ${userId}::int)`);
}

export interface AuthorizedQuote {
  quote: Quote;
  wedding: Wedding;
}

export async function getAuthorizedQuote(
  clerkUserId: string,
  quoteId: number,
): Promise<AuthorizedQuote | null> {
  const rows = await db
    .select({ quote: quotesTable, wedding: weddingsTable })
    .from(quotesTable)
    .innerJoin(weddingsTable, eq(quotesTable.weddingId, weddingsTable.id))
    .innerJoin(usersTable, eq(usersTable.clerkId, clerkUserId))
    .leftJoin(
      weddingMembersTable,
      and(
        eq(weddingMembersTable.weddingId, weddingsTable.id),
        eq(weddingMembersTable.userId, usersTable.id),
      ),
    )
    .where(
      and(
        eq(quotesTable.id, quoteId),
        or(
          isNotNull(weddingMembersTable.id),
          eq(weddingsTable.userId, usersTable.id),
        ),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
