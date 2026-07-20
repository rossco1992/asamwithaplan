import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that verifies a Clerk session and attaches the Clerk user ID
 * to req.clerkUserId. Returns 401 for unauthenticated requests.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkUserId = userId;
  next();
}
