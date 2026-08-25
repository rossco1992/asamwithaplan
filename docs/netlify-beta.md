# Netlify beta deployment

The public Netlify site continues to use the root `netlify.toml` and publish
the standalone `landing/` project. The beta application is a **second Netlify
site** connected to the same GitHub repository. Its package-specific
configuration lives at `artifacts/marrymap/netlify.toml`.

This setup publishes the React application, rewrites `/api/*` to the Express
API function, and uses a protected Netlify Background Function for timeline
generation. The background function preserves the existing `202` plus polling
experience without relying on work continuing after a synchronous function
has returned.

## 1. Create the second Netlify site

1. In Netlify, select **Add new project** and import
   `rossco1992/asamwithaplan` again.
2. When Netlify asks which site in the monorepo to deploy, choose
   `artifacts/marrymap`. If configuring manually, set **Package directory** to
   `artifacts/marrymap` and leave **Base directory** empty.
3. Deploy from `main` and give the site a distinct name such as
   `asamwithaplan-beta`.
4. Confirm Netlify found `artifacts/marrymap/netlify.toml`. It should show:

   - Build command: `pnpm --filter @workspace/marrymap build`
   - Publish directory: `artifacts/marrymap/dist/public`
   - Functions directory: `artifacts/marrymap/netlify/functions`

Do not change the existing landing-page site's repository or build settings.

## 2. Add environment variables

Add these under **Project configuration → Environment variables** on the new
beta site. Store secrets in the Netlify UI, never in the repository.

| Variable                     | Scope     | Value                                                                    |
| ---------------------------- | --------- | ------------------------------------------------------------------------ |
| `VITE_CLERK_PUBLISHABLE_KEY` | Builds    | Clerk development publishable key (`pk_test_...`)                        |
| `CLERK_PUBLISHABLE_KEY`      | Functions | The same Clerk publishable key                                           |
| `CLERK_SECRET_KEY`           | Functions | Matching Clerk development secret key (`sk_test_...`)                    |
| `CLERK_AUTHORIZED_PARTIES`   | Functions | Exact beta origin, for example `https://asamwithaplan-beta.netlify.app`  |
| `DATABASE_URL`               | Functions | Beta Postgres connection string; use a pooled URL for serverless hosting |
| `OPENAI_API_KEY`             | Functions | OpenAI project key used for beta testing                                 |
| `NETLIFY_BACKGROUND_SECRET`  | Functions | A new random value of at least 32 bytes                                  |

The non-secret build values `NODE_VERSION`, `PNPM_VERSION`, `PORT`, and
`BASE_PATH` are already defined in the app-specific Netlify configuration.

Generate `NETLIFY_BACKGROUND_SECRET` with a password manager or, from a
terminal, with:

```bash
openssl rand -hex 32
```

If a custom OpenAI-compatible endpoint is required, also add
`OPENAI_BASE_URL` with Functions scope. `NETLIFY_BACKGROUND_FUNCTION_URL` is
an optional override; normally the function automatically uses Netlify's
`URL` value.

After adding or changing environment variables, trigger a new deploy. Netlify
applies function environment variables at deploy time.

## 3. Prepare the beta database

Use a separate beta database when possible. Apply the schema once from a
trusted development machine; do not run schema pushes on every Netlify build.

```bash
DATABASE_URL='postgres://...' pnpm db:push
```

For Supabase or another serverless Postgres provider, use its pooled connection
URL in Netlify to avoid consuming a new direct database connection for every
warm function instance.

## 4. Configure Clerk for beta access

Use Clerk **development** keys with the Netlify-provided `*.netlify.app` beta
URL. Keep the beta limited to the accounts invited to the Clerk development
instance. This is preferable to Netlify site-level password protection because
the API function must be able to invoke the protected background function on
the same site.

Before testing, confirm the beta origin is allowed in Clerk and matches
`CLERK_AUTHORIZED_PARTIES` exactly, including `https://` and without a trailing
slash. Production Clerk keys should only be introduced when the production
domain and production Clerk instance are ready.

## 5. Smoke test the deployment

1. Open `https://<beta-site>.netlify.app/api/healthz` and confirm the response
   is `{"status":"ok"}`.
2. Open `/sign-up`, create a beta account, and complete email verification.
3. Complete wedding onboarding and confirm the timeline moves from generating
   to ready after polling.
4. Refresh `/dashboard` and confirm the current wedding and timeline restore.
5. Add a pasted-text quote, then upload a text-based PDF quote.
6. Compare quotes, select one, refresh, and confirm the selection persists.
7. Sign out and confirm `/dashboard` redirects to the signed-out landing page.
8. Repeat the main flow on a phone or iPad.

If timeline generation remains in `generating`, open **Logs & Metrics →
Functions** in Netlify and inspect both `api` and
`timeline-generation-background`. Never paste database, Clerk, OpenAI, or
background-function secrets into an issue or chat.

## References

- [Netlify Express guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/express/)
- [Netlify monorepo configuration](https://docs.netlify.com/build/configure-builds/monorepos/)
- [Netlify Background Functions](https://docs.netlify.com/build/functions/background-functions/)
- [Clerk environment guidance](https://clerk.com/docs/guides/development/managing-environments)
