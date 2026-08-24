import type { NextFunction, Request, RequestHandler, Response } from "express";

type ResourceLookup<T> = (
  clerkUserId: string,
  resourceId: number,
) => Promise<T | null>;

type ResourceIdResolver = (req: Request) => unknown;

interface ResourceAccessOptions<T> {
  resolveId: ResourceIdResolver;
  lookup: ResourceLookup<T>;
  invalidIdError: string;
  notFoundError: string;
}

interface ResourceRequest<T> extends Request {
  clerkUserId?: string;
  authorizedResource?: T;
}

const MAX_POSTGRES_INTEGER = 2_147_483_647;

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value)) return null;

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_POSTGRES_INTEGER) {
    return null;
  }
  return parsed;
}

/**
 * Creates a fail-closed resource guard. Missing and inaccessible resources use
 * the same 404 response so callers cannot probe whether another user's data
 * exists. `requireAuth` should run first; the explicit 401 keeps the guard safe
 * if a future route is wired incorrectly.
 */
export function requireResourceAccess<T>({
  resolveId,
  lookup,
  invalidIdError,
  notFoundError,
}: ResourceAccessOptions<T>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resourceRequest = req as ResourceRequest<T>;
    const clerkUserId = resourceRequest.clerkUserId;

    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const resourceId = parsePositiveInteger(resolveId(req));
    if (resourceId === null) {
      res.status(400).json({ error: invalidIdError });
      return;
    }

    try {
      const resource = await lookup(clerkUserId, resourceId);
      if (!resource) {
        res.status(404).json({ error: notFoundError });
        return;
      }

      resourceRequest.authorizedResource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getAuthorizedResource<T>(req: Request): T {
  const resource = (req as ResourceRequest<T>).authorizedResource;
  if (!resource) {
    throw new Error("Authorized resource missing; resource guard was not run");
  }
  return resource;
}
