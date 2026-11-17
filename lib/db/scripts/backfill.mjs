// Data steps that `drizzle-kit push` can't express. `pnpm db:push` runs this
// right after the schema push; every statement is idempotent, so running it
// again is harmless. Keep it in step with the matching SQL migrations.
import pg from "pg";

const steps = [
  {
    // 0004_couple_sharing: every wedding's creator is its owner member.
    name: "wedding owner memberships",
    sql: `INSERT INTO "wedding_members" ("wedding_id", "user_id", "role", "joined_at")
          SELECT "id", "user_id", 'owner', "created_at" FROM "weddings"
          ON CONFLICT DO NOTHING`,
  },
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set to run the data backfill.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const step of steps) {
    const result = await client.query(step.sql);
    console.log(`backfill: ${step.name}: ${result.rowCount ?? 0} row(s) added`);
  }
} finally {
  await client.end();
}
