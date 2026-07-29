# A Sam with a plan — temporary landing page

A standalone, static "coming soon" marketing page reusing the real app's
copy and branding, minus anything that needs the real backend (Clerk auth,
Postgres, OpenAI). Meant to be deployed on its own while the full app
(`../artifacts/marrymap`) is still being finished.

This is deliberately **not** part of the pnpm workspace — it has its own
`package.json` and lockfile-free `npm install`, so it builds and deploys
independently of the rest of the monorepo.

## Develop locally

```bash
cd landing
npm install
npm run dev
```

## Waitlist form

The signup form POSTs `{ email }` as JSON to `VITE_FORM_ENDPOINT`. Until
that's set, submitting shows a "not connected yet" message instead of
silently failing.

1. Create a free form at [Formspree](https://formspree.io) (or any service
   that accepts a JSON POST and returns 200 on success).
2. Copy `.env.example` to `.env` and set `VITE_FORM_ENDPOINT` to your form's
   endpoint.
3. Also add `VITE_FORM_ENDPOINT` as an environment variable in your Vercel
   project settings so it's set at build time in production.

## Deploy to Vercel

1. Push this repo to GitHub (or connect it directly).
2. In Vercel, "Add New Project" → import this repo.
3. Set **Root Directory** to `landing`. Vercel auto-detects the Vite
   framework preset (build command `npm run build`, output dir `dist`).
4. Add the `VITE_FORM_ENDPOINT` environment variable (see above).
5. Deploy. Point your temporary/marketing domain at it, then swap it out
   once the real app is ready.
