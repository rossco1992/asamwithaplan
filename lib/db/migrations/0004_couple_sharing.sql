CREATE TABLE "wedding_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"wedding_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wedding_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"wedding_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wedding_members_role_check" CHECK ("wedding_members"."role" IN ('owner', 'partner'))
);
--> statement-breakpoint
ALTER TABLE "weddings" ALTER COLUMN "wedding_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "wedding_invites" ADD CONSTRAINT "wedding_invites_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_invites" ADD CONSTRAINT "wedding_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_invites" ADD CONSTRAINT "wedding_invites_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wedding_invites_code_hash_idx" ON "wedding_invites" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "wedding_invites_wedding_id_idx" ON "wedding_invites" USING btree ("wedding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wedding_members_wedding_user_idx" ON "wedding_members" USING btree ("wedding_id","user_id");--> statement-breakpoint
CREATE INDEX "wedding_members_user_id_idx" ON "wedding_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wedding_members_one_per_role_idx" ON "wedding_members" USING btree ("wedding_id","role");--> statement-breakpoint
-- Every existing wedding keeps its creator as the owner, so access is unchanged.
INSERT INTO "wedding_members" ("wedding_id", "user_id", "role", "joined_at")
SELECT "id", "user_id", 'owner', "created_at" FROM "weddings"
ON CONFLICT DO NOTHING;
