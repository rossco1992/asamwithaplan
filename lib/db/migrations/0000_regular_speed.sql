CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "weddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"wedding_date" date NOT NULL,
	"city" text NOT NULL,
	"guest_count" integer NOT NULL,
	"style" text NOT NULL,
	"generation_status" text DEFAULT 'generating' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timelines" (
	"id" serial PRIMARY KEY NOT NULL,
	"wedding_id" integer NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"tasks" jsonb NOT NULL,
	CONSTRAINT "timelines_wedding_id_unique" UNIQUE("wedding_id")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"wedding_id" integer NOT NULL,
	"vendor_name" text NOT NULL,
	"category" text NOT NULL,
	"raw_text" text NOT NULL,
	"line_items" jsonb NOT NULL,
	"total_amount" real NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"parsed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timelines" ADD CONSTRAINT "timelines_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE no action ON UPDATE no action;