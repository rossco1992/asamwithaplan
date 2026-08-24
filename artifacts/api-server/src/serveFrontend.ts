import type { Express } from "express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger";

export function serveFrontend(app: Express): void {
  // Point STATIC_DIR at the frontend build, or leave it unset to use the
  // default monorepo location. Netlify publishes the frontend separately and
  // imports app.ts directly, so this Node-server concern stays out of the
  // serverless function bundle.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = process.env.STATIC_DIR
    ? path.resolve(process.env.STATIC_DIR)
    : path.resolve(here, "..", "..", "marrymap", "dist", "public");

  if (!fs.existsSync(path.join(staticDir, "index.html"))) {
    logger.info(
      { staticDir },
      "No built frontend found — running API-only (use `vite dev` for the frontend)",
    );
    return;
  }

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
}
