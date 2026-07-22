# A Sam with a plan

AI wedding-planning app: couples enter their wedding details and get a
generated week-by-week timeline plus vendor-quote comparison.

This project has **no dependency on Replit** — it runs on any machine or host
with Node, Postgres, and API keys for Clerk (auth) and OpenAI.

## Stack

- **Frontend:** React 19 + Vite + Tailwind, Clerk for auth (`artifacts/marrymap`)
- **API:** Express 5, Drizzle ORM (`artifacts/api-server`)
- **DB:** PostgreSQL (`lib/db`)
- **AI:** OpenAI (`lib/integrations-openai-ai-server`)
- pnpm workspace, Node 24+, TypeScript 5.9

## What you need to supply

Replit used to broker these; now you bring your own (all have free tiers):

- **Postgres** — local (Docker) or hosted (Neon, Supabase, RDS, …)
- **Clerk** — a Clerk application → `pk_...` / `sk_...` keys ([dashboard](https://dashboard.clerk.com))
- **OpenAI** — an API key ([platform](https://platform.openai.com/api-keys))

## Local development

Two processes: Vite (frontend) and the Express API. Vite proxies `/api` to the
API server so the browser sees one origin.

```bash
pnpm install

cp artifacts/api-server/.env.example artifacts/api-server/.env   # fill in
cp artifacts/marrymap/.env.example   artifacts/marrymap/.env     # fill in
```

Values that must line up across the two files:

- api-server `PORT=3001` ⇄ frontend `API_PROXY_TARGET=http://localhost:3001`
- `CLERK_PUBLISHABLE_KEY` (api) == `VITE_CLERK_PUBLISHABLE_KEY` (frontend)

Create the schema, then run both:

```bash
pnpm db:push                          # creates all tables

# terminal 1 — API (loads .env via node --env-file)
pnpm --filter api-server dev:local
# terminal 2 — frontend
pnpm --filter marrymap dev            # open http://localhost:5173
```

## Production (single Node server)

The API server also serves the built frontend, so production is **one process
on one port**.

```bash
pnpm install --prod=false

# Build both. The frontend needs its build-time env inlined:
PORT=8080 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_live_... \
  pnpm build:web

# Apply DB schema (once, and after schema changes)
DATABASE_URL=postgres://... pnpm db:push

# Run — set the runtime env, then start
PORT=8080 \
DATABASE_URL=postgres://... \
OPENAI_API_KEY=sk-... \
CLERK_SECRET_KEY=sk_live_... \
CLERK_PUBLISHABLE_KEY=pk_live_... \
  pnpm start
```

The server serves the frontend from `artifacts/marrymap/dist/public` by default
(override with `STATIC_DIR`). Deep links fall back to `index.html` for
client-side routing. Health check: `GET /api/healthz`.

This runs as-is on any Node host — a VPS, Docker, Render, Railway, Fly, etc.

## Environment reference

**api-server** (`artifacts/api-server/.env`)

| Var | Required | Notes |
|---|---|---|
| `PORT` | yes | Server port |
| `DATABASE_URL` | yes | Postgres connection string |
| `OPENAI_API_KEY` | yes | OpenAI key |
| `OPENAI_BASE_URL` | no | Only for a proxy / compatible gateway |
| `CLERK_SECRET_KEY` | yes | Clerk secret key |
| `CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key |
| `STATIC_DIR` | no | Override built-frontend path |

**frontend** (`artifacts/marrymap/.env`, build-time)

| Var | Required | Notes |
|---|---|---|
| `PORT` | yes (dev) | Vite dev server port |
| `BASE_PATH` | yes | App base path — use `/` |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | Same as api `CLERK_PUBLISHABLE_KEY` |
| `API_PROXY_TARGET` | no | Dev only; default `http://localhost:3001` |

## Useful scripts

- `pnpm typecheck` — full workspace typecheck
- `pnpm build:web` — build frontend + API for production
- `pnpm start` — run the single production server
- `pnpm db:push` — sync the Drizzle schema to `DATABASE_URL`

## Debugging timeline generation

Timeline generation runs in the background (`generateAndStore` in
`artifacts/api-server/src/routes/timelines.ts`). On failure the server logs
`[timelines] generation failed …` with the OpenAI status/code, and the same
detail is stored and shown in the UI under "Technical detail" on the failed
screen. On success it logs a token-usage line.
