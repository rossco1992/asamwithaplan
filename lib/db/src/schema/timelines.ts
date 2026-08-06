import { pgTable, serial, integer, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { weddingsTable } from "./weddings";

export type TimelineTaskPriority = "urgent" | "this-week" | "upcoming";

export interface TimelineTask {
  /**
   * Stable identifier used to record completion. Assigned when the timeline is
   * persisted; older rows predate it, so read it through `timelineTaskId()`
   * rather than accessing it directly.
   */
  id?: string;
  title: string;
  priority: TimelineTaskPriority;
}

export interface TimelineWeek {
  weekLabel: string;
  phase: string;
  tasks: TimelineTask[];
}

/**
 * The completion key for a task. Falls back to its position for timelines
 * generated before tasks carried ids — positions are stable because a timeline
 * is never edited in place; regenerating deletes the row and its completions.
 */
export function timelineTaskId(task: TimelineTask, weekIndex: number, taskIndex: number): string {
  return task.id ?? `w${weekIndex}t${taskIndex}`;
}

export const timelinesTable = pgTable("timelines", {
  id: serial("id").primaryKey(),
  weddingId: integer("wedding_id")
    .notNull()
    .unique() // one timeline per wedding
    .references(() => weddingsTable.id),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  tasks: jsonb("tasks").$type<TimelineWeek[]>().notNull(),
});

/**
 * One row per ticked-off task. Kept out of the `tasks` jsonb so that two
 * partners planning at once can't clobber each other's ticks with a
 * read-modify-write of the whole array.
 */
export const timelineTaskCompletionsTable = pgTable(
  "timeline_task_completions",
  {
    id: serial("id").primaryKey(),
    timelineId: integer("timeline_id")
      .notNull()
      .references(() => timelinesTable.id),
    taskId: text("task_id").notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("timeline_task_completions_timeline_task_idx").on(table.timelineId, table.taskId)],
);

export type Timeline = typeof timelinesTable.$inferSelect;
export type TimelineTaskCompletion = typeof timelineTaskCompletionsTable.$inferSelect;
