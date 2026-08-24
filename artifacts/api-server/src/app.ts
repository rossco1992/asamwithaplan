import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const clerkAuthorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

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
// from the environment. Restrict accepted request origins in hosted
// environments by setting CLERK_AUTHORIZED_PARTIES to a comma-separated list.
app.use(
  clerkMiddleware(
    clerkAuthorizedParties?.length
      ? { authorizedParties: clerkAuthorizedParties }
      : undefined,
  ),
);

app.use("/api", router);

export default app;
