import { pgTable, serial, integer, text, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import { weddingsTable } from "./weddings";

export const vendorCategories = [
  "catering",
  "flowers",
  "photography",
  "videography",
  "music",
  "venue",
  "transportation",
  "cake",
  "hair_makeup",
  "officiant",
  "other",
] as const;
export type VendorCategory = (typeof vendorCategories)[number];

export const vendorCategoryLabels: Record<VendorCategory, string> = {
  catering: "Catering",
  flowers: "Flowers & Florals",
  photography: "Photography",
  videography: "Videography",
  music: "Music & DJ",
  venue: "Venue",
  transportation: "Transportation",
  cake: "Wedding Cake",
  hair_makeup: "Hair & Makeup",
  officiant: "Officiant",
  other: "Other",
};

export interface QuoteLineItem {
  item: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  weddingId: integer("wedding_id")
    .notNull()
    .references(() => weddingsTable.id),
  vendorName: text("vendor_name").notNull(),
  category: text("category").$type<VendorCategory>().notNull(),
  rawText: text("raw_text").notNull(),
  lineItems: jsonb("line_items").$type<QuoteLineItem[]>().notNull(),
  totalAmount: real("total_amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  parsedAt: timestamp("parsed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  selectedAt: timestamp("selected_at"),
});

export type Quote = typeof quotesTable.$inferSelect;
export type InsertQuote = typeof quotesTable.$inferInsert;
