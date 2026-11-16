CREATE TABLE "milestone_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"milestone_id" integer NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"done_at" timestamp,
	"done_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"wedding_id" integer NOT NULL,
	"template_key" text,
	"title" text NOT NULL,
	"notes" text,
	"schedule" text NOT NULL,
	"offset_weeks" integer,
	"fixed_date" date,
	"status" text DEFAULT 'todo' NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_schedule_check" CHECK (("milestones"."schedule" = 'relative' AND "milestones"."offset_weeks" IS NOT NULL AND "milestones"."fixed_date" IS NULL) OR ("milestones"."schedule" = 'fixed' AND "milestones"."fixed_date" IS NOT NULL AND "milestones"."offset_weeks" IS NULL)),
	CONSTRAINT "milestones_status_check" CHECK ("milestones"."status" IN ('todo', 'done', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "milestone_tasks" ADD CONSTRAINT "milestone_tasks_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_tasks" ADD CONSTRAINT "milestone_tasks_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestone_tasks_milestone_id_idx" ON "milestone_tasks" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "milestones_wedding_id_idx" ON "milestones" USING btree ("wedding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_wedding_template_key_idx" ON "milestones" USING btree ("wedding_id","template_key");