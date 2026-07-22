# Running locally (without Replit)

The app is two processes: the **api-server** (Express + Postgres + OpenAI) and
the **marrymap** frontend (Vite). In production the Replit router serves both
on one host; locally you run them side by side and Vite proxies `/api` to the
API server.

## 1. Prerequisites

- Node 24+ (for `--env-file`) and `pnpm`
- A local Postgres (or any reachable `DATABASE_URL`)
- An OpenAI API key
- A Clerk **development** instance (Clerk Dashboard → API Keys → `pk_test_…` /
  `sk_test_…`)

## 2. Install

```bash
pnpm install
```

## 3. Configure env

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
cp artifacts/marrymap/.env.example   artifacts/marrymap/.env
```

Fill in both files. The three values that must line up:

- `PORT=3001` (api-server) ⇄ `API_PROXY_TARGET=http://localhost:3001` (frontend)
- `CLERK_PUBLISHABLE_KEY` (api-server) == `VITE_CLERK_PUBLISHABLE_KEY` (frontend)
- `CLERK_SECRET_KEY` and `AI_INTEGRATIONS_OPENAI_API_KEY` are api-server only

`.env` files are gitignored — only `.env.example` is committed.

## 4. Create the database schema

With `DATABASE_URL` set in `artifacts/api-server/.env`:

```bash
createdb marrymap   # or however you provision your DB
DATABASE_URL=postgres://postgres:postgres@localhost:5432/marrymap \
  pnpm --filter db push
```

`push` syncs the Drizzle schema directly, including the `generation_error`
column used for the error-surfacing behavior.

## 5. Run both processes (two terminals)

```bash
# terminal 1 — API
pnpm --filter api-server dev:local

# terminal 2 — frontend
pnpm --filter marrymap dev
```

Open the frontend at `http://localhost:5173`. Sign in with Clerk, and the
onboarding form will POST to `/api/timelines/generate`, which Vite forwards to
the API server on `:3001`.

## 6. Reproducing / verifying the timeline error

- **Watch the real error.** The api-server terminal logs every failure as
  `[timelines] generation failed for wedding <id> { message, status, code }`,
  and the same detail now renders in the UI under "Technical detail" on the
  failed screen.
- **Confirm the fix.** On success the api-server logs
  `[timelines] tokens — prompt: …, completion: …, total: …`. The `completion`
  count should sit well under the 8000 ceiling with a full JSON body (it used
  to hit the old 2500 limit and fail with `finish_reason=length`).
- **Force a failure on demand.** Temporarily set an invalid `model` in
  `generateAndStore` (`artifacts/api-server/src/routes/timelines.ts`), submit,
  and you should see e.g. `HTTP 404 · model_not_found · …` both in the log and
  on the failed screen. Revert when done.

## Notes

- The Clerk proxy middleware (`/api/__clerk`) is production-only, so in dev the
  browser talks to Clerk directly — leave `VITE_CLERK_PROXY_URL` empty.
- Because Vite proxies `/api`, the browser sees a single origin, so session
  cookies work without any CORS configuration.
