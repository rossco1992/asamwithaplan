import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  date,
  timestamp,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { weddingsTable } from "./weddings";
import { usersTable } from "./users";

export type MilestoneScheduleKind = "relative" | "fixed";
export type MilestoneStatusKind = "todo" | "done" | "skipped";

/**
 * One stop on a couple's journey map.
 *
 * - `relative` milestones sit `offset_weeks` before the wedding and move when
 *   the wedding date changes.
 * - `fixed` milestones are pinned to `fixed_date` and never move.
 *
 * Template milestones carry the `template_key` they were seeded from; the
 * unique index makes seeding idempotent. Custom milestones have no key.
 */
export const milestonesTable = pgTable(
  "milestones",
  {
    id: serial("id").primaryKey(),
    weddingId: integer("wedding_id")
      .notNull()
      .references(() => weddingsTable.id, { onDelete: "cascade" }),
    templateKey: text("template_key"),
    title: text("title").notNull(),
    notes: text("notes"),
    schedule: text("schedule").$type<MilestoneScheduleKind>().notNull(),
    offsetWeeks: integer("offset_weeks"),
    fixedDate: date("fixed_date"),
    status: text("status")
      .$type<MilestoneStatusKind>()
      .default("todo")
      .notNull(),
    isCustom: boolean("is_custom").default(false).notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("milestones_wedding_id_idx").on(table.weddingId),
    uniqueIndex("milestones_wedding_template_key_idx").on(
      table.weddingId,
      table.templateKey,
    ),
    check(
      "milestones_schedule_check",
      sql`(${table.schedule} = 'relative' AND ${table.offsetWeeks} IS NOT NULL AND ${table.fixedDate} IS NULL) OR (${table.schedule} = 'fixed' AND ${table.fixedDate} IS NOT NULL AND ${table.offsetWeeks} IS NULL)`,
    ),
    check(
      "milestones_status_check",
      sql`${table.status} IN ('todo', 'done', 'skipped')`,
    ),
  ],
);

export const milestoneTasksTable = pgTable(
  "milestone_tasks",
  {
    id: serial("id").primaryKey(),
    milestoneId: integer("milestone_id")
      .notNull()
      .references(() => milestonesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: integer("position").default(0).notNull(),
    doneAt: timestamp("done_at"),
    doneByUserId: integer("done_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("milestone_tasks_milestone_id_idx").on(table.milestoneId)],
);

export type Milestone = typeof milestonesTable.$inferSelect;
export type InsertMilestone = typeof milestonesTable.$inferInsert;
export type MilestoneTask = typeof milestoneTasksTable.$inferSelect;
export type InsertMilestoneTask = typeof milestoneTasksTable.$inferInsert;
