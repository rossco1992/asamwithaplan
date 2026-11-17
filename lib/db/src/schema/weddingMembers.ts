import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { weddingsTable } from "./weddings";
import { usersTable } from "./users";

export type WeddingMemberRole = "owner" | "partner";

/**
 * Who can open a wedding. MVP 1 allows the couple only: the partner who
 * created the plan (`owner`) and at most one `partner` who joined with an
 * invite code. Every wedding-scoped API check goes through this table.
 */
export const weddingMembersTable = pgTable(
  "wedding_members",
  {
    id: serial("id").primaryKey(),
    weddingId: integer("wedding_id")
      .notNull()
      .references(() => weddingsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").$type<WeddingMemberRole>().notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wedding_members_wedding_user_idx").on(
      table.weddingId,
      table.userId,
    ),
    index("wedding_members_user_id_idx").on(table.userId),
    // One owner per wedding, and at most one partner beside them.
    uniqueIndex("wedding_members_one_per_role_idx").on(
      table.weddingId,
      table.role,
    ),
    check(
      "wedding_members_role_check",
      sql`${table.role} IN ('owner', 'partner')`,
    ),
  ],
);

/**
 * A single-use code one partner shares with the other. Only a SHA-256 hash of
 * the code is stored, so a database read never reveals a working code.
 */
export const weddingInvitesTable = pgTable(
  "wedding_invites",
  {
    id: serial("id").primaryKey(),
    weddingId: integer("wedding_id")
      .notNull()
      .references(() => weddingsTable.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    usedByUserId: integer("used_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wedding_invites_code_hash_idx").on(table.codeHash),
    index("wedding_invites_wedding_id_idx").on(table.weddingId),
  ],
);

export type WeddingMember = typeof weddingMembersTable.$inferSelect;
export type InsertWeddingMember = typeof weddingMembersTable.$inferInsert;
export type WeddingInvite = typeof weddingInvitesTable.$inferSelect;
