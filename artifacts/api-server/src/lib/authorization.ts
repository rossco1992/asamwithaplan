import { and, desc, eq } from "drizzle-orm";
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
 */

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
      role: weddingMembersTable.role,
      userId: usersTable.id,
    })
    .from(weddingsTable)
    .innerJoin(
      weddingMembersTable,
      eq(weddingMembersTable.weddingId, weddingsTable.id),
    )
    .innerJoin(usersTable, eq(weddingMembersTable.userId, usersTable.id))
    .where(
      and(eq(weddingsTable.id, weddingId), eq(usersTable.clerkId, clerkUserId)),
    )
    .limit(1);

  return rows[0] ?? null;
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
): Promise<Wedding | null> {
  const rows = await db
    .select({ wedding: weddingsTable })
    .from(weddingsTable)
    .innerJoin(
      weddingMembersTable,
      eq(weddingMembersTable.weddingId, weddingsTable.id),
    )
    .where(eq(weddingMembersTable.userId, userId))
    .orderBy(desc(weddingsTable.createdAt), desc(weddingsTable.id))
    .limit(1);

  return rows[0]?.wedding ?? null;
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
    .innerJoin(
      weddingMembersTable,
      eq(weddingMembersTable.weddingId, weddingsTable.id),
    )
    .innerJoin(usersTable, eq(weddingMembersTable.userId, usersTable.id))
    .where(
      and(eq(quotesTable.id, quoteId), eq(usersTable.clerkId, clerkUserId)),
    )
    .limit(1);

  return rows[0] ?? null;
}
