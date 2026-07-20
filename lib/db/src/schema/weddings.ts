import { pgTable, serial, text, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const weddingStyleEnum = ["intimate", "standard", "large"] as const;
export type WeddingStyle = (typeof weddingStyleEnum)[number];

export const weddingsTable = pgTable("weddings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  weddingDate: date("wedding_date").notNull(),
  city: text("city").notNull(),
  guestCount: integer("guest_count").notNull(),
  style: text("style").$type<WeddingStyle>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWeddingSchema = createInsertSchema(weddingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWedding = z.infer<typeof insertWeddingSchema>;
export type Wedding = typeof weddingsTable.$inferSelect;
