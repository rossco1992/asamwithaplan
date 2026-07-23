import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Standard Clerk middleware — reads CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY
// from the environment. The frontend talks to Clerk's API directly, so no
// domain proxy is needed.
app.use(clerkMiddleware());

app.use("/api", router);

// ── Single-server production: serve the built React frontend ──────────────────
// Point STATIC_DIR at the frontend build, or leave it unset to use the default
// monorepo location. When the directory is absent (e.g. local dev, where Vite
// serves the frontend and proxies /api here), we stay in API-only mode.
const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(here, "..", "..", "marrymap", "dist", "public");

if (fs.existsSync(path.join(staticDir, "index.html"))) {
  app.use(express.static(staticDir));

  // SPA fallback: any non-API GET that didn't match a static file returns
  // index.html so client-side routing works on deep links / refreshes.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });

  logger.info({ staticDir }, "Serving built frontend");
} else {
  logger.info(
    { staticDir },
    "No built frontend found — running API-only (use `vite dev` for the frontend)",
  );
}

export default app;
