CREATE TABLE "ai_workflow_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"wedding_id" integer,
	"request_id" text NOT NULL,
	"workflow" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"error_category" text,
	"latency_ms" integer NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" double precision,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN "generation_error" text;--> statement-breakpoint
ALTER TABLE "ai_workflow_runs" ADD CONSTRAINT "ai_workflow_runs_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE set null ON UPDATE no action;