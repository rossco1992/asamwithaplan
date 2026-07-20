import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { weddingsTable } from "./weddings";

export type TimelineTaskPriority = "urgent" | "this-week" | "upcoming";

export interface TimelineTask {
  title: string;
  priority: TimelineTaskPriority;
}

export interface TimelineWeek {
  weekLabel: string;
  phase: string;
  tasks: TimelineTask[];
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

export type Timeline = typeof timelinesTable.$inferSelect;
