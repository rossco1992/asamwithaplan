import { and, eq } from "drizzle-orm";
import {
  db,
  quotesTable,
  usersTable,
  weddingsTable,
  type Quote,
  type User,
  type Wedding,
} from "@workspace/db";

/**
 * The current MVP is owner-only. Keep wedding-scoped authorization behind
 * these helpers so collaborator membership can be added here without every
 * route implementing its own access rules.
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

export async function getAuthorizedWedding(
  clerkUserId: string,
  weddingId: number,
): Promise<Wedding | null> {
  const rows = await db
    .select({ wedding: weddingsTable })
    .from(weddingsTable)
    .innerJoin(usersTable, eq(weddingsTable.userId, usersTable.id))
    .where(
      and(eq(weddingsTable.id, weddingId), eq(usersTable.clerkId, clerkUserId)),
    )
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
    .innerJoin(usersTable, eq(weddingsTable.userId, usersTable.id))
    .where(
      and(eq(quotesTable.id, quoteId), eq(usersTable.clerkId, clerkUserId)),
    )
    .limit(1);

  return rows[0] ?? null;
}
