import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  milestonesTable,
  milestoneTasksTable,
  type InsertMilestone,
  type Milestone,
  type MilestoneTask,
  type Wedding,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getAuthenticatedUser,
  getAuthorizedWedding,
} from "../lib/authorization";
import {
  getAuthorizedResource,
  requireResourceAccess,
} from "../lib/resourceAccess";
import { MILESTONE_TEMPLATES } from "../lib/milestoneTemplates";
import {
  SCHEDULABLE_PHASE_KEYS,
  addDays,
  buildJourney,
  getPhase,
  isIsoDate,
  previewDateChange,
  type Journey,
  type MilestoneInput,
} from "../lib/milestoneSchedule";

// Mounted at /weddings/:weddingId/milestones, so params come from the parent.
const router: IRouter = Router({ mergeParams: true });

export const MAX_CUSTOM_MILESTONES = 100;
export const MAX_TASKS_PER_MILESTONE = 30;

// ── Validation ────────────────────────────────────────────────────────────────

const IsoDate = z
  .string()
  .refine(isIsoDate, "Dates must be real calendar dates as YYYY-MM-DD");

const When = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), date: IsoDate }),
  z.object({ kind: z.literal("phase"), phase: z.enum(SCHEDULABLE_PHASE_KEYS) }),
]);

const Title = z.string().trim().min(1).max(120);
const Notes = z.string().trim().max(2000);
const TaskTitle = z.string().trim().min(1).max(200);

const CreateMilestoneBody = z
  .object({
    title: Title,
    notes: Notes.optional(),
    when: When,
    tasks: z.array(TaskTitle).max(MAX_TASKS_PER_MILESTONE).optional(),
  })
  .strict();

const UpdateMilestoneBody = z
  .object({
    title: Title.optional(),
    notes: Notes.nullable().optional(),
    status: z.enum(["todo", "done", "skipped"]).optional(),
    when: When.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");

const CreateTaskBody = z.object({ title: TaskTitle }).strict();

const UpdateTaskBody = z
  .object({ title: TaskTitle.optional(), done: z.boolean().optional() })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");

const DatePreviewBody = z.object({ weddingDate: IsoDate.nullable() }).strict();

const MAX_POSTGRES_INTEGER = 2_147_483_647;

function parseId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_POSTGRES_INTEGER
    ? parsed
    : null;
}

function serverToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The couple's local date, sent by the app, so "overdue" flips at their
 * midnight rather than UTC's. Anything implausible falls back to the server's
 * date: every real time zone is within a day of UTC.
 */
function resolveToday(req: Request): string {
  const fallback = serverToday();
  const requested = req.query["today"];
  if (typeof requested !== "string" || !isIsoDate(requested)) return fallback;
  const earliest = addDays(fallback, -1);
  const latest = addDays(fallback, 1);
  return requested >= earliest && requested <= latest ? requested : fallback;
}

function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: "Invalid request",
    details: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

/** Schedule columns for a `when`. */
function scheduleFor(
  when: z.infer<typeof When>,
): Pick<InsertMilestone, "schedule" | "offsetWeeks" | "fixedDate"> {
  if (when.kind === "date") {
    return { schedule: "fixed", fixedDate: when.date, offsetWeeks: null };
  }
  return {
    schedule: "relative",
    offsetWeeks: getPhase(when.phase).defaultOffsetWeeks,
    fixedDate: null,
  };
}

// ── Loading ───────────────────────────────────────────────────────────────────

function toMilestoneInput(
  milestone: Milestone,
  tasks: MilestoneTask[],
): MilestoneInput {
  return {
    id: milestone.id,
    templateKey: milestone.templateKey,
    title: milestone.title,
    notes: milestone.notes,
    isCustom: milestone.isCustom,
    schedule: milestone.schedule,
    offsetWeeks: milestone.offsetWeeks,
    fixedDate: milestone.fixedDate,
    status: milestone.status,
    tasks: tasks
      .filter((task) => task.milestoneId === milestone.id)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((task) => ({ id: task.id, title: task.title, done: task.doneAt !== null })),
  };
}

async function loadMilestoneInputs(weddingId: number): Promise<MilestoneInput[]> {
  const milestones = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.weddingId, weddingId));
  if (milestones.length === 0) return [];

  const tasks = await db
    .select()
    .from(milestoneTasksTable)
    .where(
      inArray(
        milestoneTasksTable.milestoneId,
        milestones.map((milestone) => milestone.id),
      ),
    )
    .orderBy(asc(milestoneTasksTable.position), asc(milestoneTasksTable.id));

  return milestones.map((milestone) => toMilestoneInput(milestone, tasks));
}

/**
 * Gives a wedding its starter journey the first time the map is opened.
 * Milestones and their tasks are written in one transaction, so a failure
 * part way leaves nothing behind and the next open simply seeds again.
 * The unique (wedding, template key) index makes a concurrent second seed a
 * no-op, in which case we read back whatever the first one wrote.
 */
async function seedTemplates(weddingId: number): Promise<MilestoneInput[]> {
  const seeded = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(milestonesTable)
      .values(
        MILESTONE_TEMPLATES.map((template) => ({
          weddingId,
          templateKey: template.key,
          title: template.title,
          schedule: "relative" as const,
          offsetWeeks: template.offsetWeeks,
        })),
      )
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) return null;

    const taskValues = inserted.flatMap((milestone) => {
      const template = MILESTONE_TEMPLATES.find(
        (candidate) => candidate.key === milestone.templateKey,
      );
      return (template?.tasks ?? []).map((title, position) => ({
        milestoneId: milestone.id,
        title,
        position,
      }));
    });
    const tasks =
      taskValues.length > 0
        ? await tx.insert(milestoneTasksTable).values(taskValues).returning()
        : [];

    return inserted.map((milestone) => toMilestoneInput(milestone, tasks));
  });

  return seeded ?? loadMilestoneInputs(weddingId);
}

async function loadJourney(wedding: Wedding, today: string): Promise<Journey> {
  const milestones = await loadMilestoneInputs(wedding.id);
  return buildJourney(milestones, wedding.weddingDate ?? null, today);
}

/** Looks a milestone up inside an already-authorized wedding. */
async function findMilestone(
  weddingId: number,
  milestoneId: number,
): Promise<Milestone | null> {
  const rows = await db
    .select()
    .from(milestonesTable)
    .where(
      and(
        eq(milestonesTable.id, milestoneId),
        eq(milestonesTable.weddingId, weddingId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function findTask(
  milestoneId: number,
  taskId: number,
): Promise<MilestoneTask | null> {
  const rows = await db
    .select()
    .from(milestoneTasksTable)
    .where(
      and(
        eq(milestoneTasksTable.id, taskId),
        eq(milestoneTasksTable.milestoneId, milestoneId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function countTasks(milestoneId: number): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(milestoneTasksTable)
    .where(eq(milestoneTasksTable.milestoneId, milestoneId));
  return Number(rows[0]?.value ?? 0);
}

// ── Guards ────────────────────────────────────────────────────────────────────

const requireWedding = requireResourceAccess<Wedding>({
  resolveId: (req) => req.params["weddingId"],
  lookup: getAuthorizedWedding,
  invalidIdError: "Invalid weddingId",
  notFoundError: "Wedding not found",
});

/** Resolves :milestoneId within the authorized wedding, or answers 400/404. */
async function milestoneFromParams(
  req: Request,
  res: Response,
): Promise<{ wedding: Wedding; milestone: Milestone } | null> {
  const wedding = getAuthorizedResource<Wedding>(req);
  const milestoneId = parseId(req.params["milestoneId"]);
  if (milestoneId === null) {
    res.status(400).json({ error: "Invalid milestoneId" });
    return null;
  }
  const milestone = await findMilestone(wedding.id, milestoneId);
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return null;
  }
  return { wedding, milestone };
}

// ── GET /api/weddings/:weddingId/milestones ───────────────────────────────────

router.get("/", requireAuth, requireWedding, async (req, res) => {
  const wedding = getAuthorizedResource<Wedding>(req);
  const today = resolveToday(req);

  let milestones = await loadMilestoneInputs(wedding.id);
  if (milestones.length === 0) {
    milestones = await seedTemplates(wedding.id);
  }

  res.json(buildJourney(milestones, wedding.weddingDate ?? null, today));
});

// ── POST /api/weddings/:weddingId/milestones ──────────────────────────────────

router.post("/", requireAuth, requireWedding, async (req, res) => {
  const wedding = getAuthorizedResource<Wedding>(req);
  const parsed = CreateMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const existing = await db
    .select({ value: count() })
    .from(milestonesTable)
    .where(
      and(
        eq(milestonesTable.weddingId, wedding.id),
        eq(milestonesTable.isCustom, true),
      ),
    );
  if (Number(existing[0]?.value ?? 0) >= MAX_CUSTOM_MILESTONES) {
    res.status(409).json({
      error: `You can add up to ${MAX_CUSTOM_MILESTONES} milestones of your own`,
    });
    return;
  }

  const [milestone] = await db
    .insert(milestonesTable)
    .values({
      weddingId: wedding.id,
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      isCustom: true,
      ...scheduleFor(parsed.data.when),
    })
    .returning();

  const taskTitles = parsed.data.tasks ?? [];
  if (milestone && taskTitles.length > 0) {
    await db.insert(milestoneTasksTable).values(
      taskTitles.map((title, position) => ({
        milestoneId: milestone.id,
        title,
        position,
      })),
    );
  }

  res.status(201).json({
    milestoneId: milestone?.id ?? null,
    journey: await loadJourney(wedding, resolveToday(req)),
  });
});

// ── POST /api/weddings/:weddingId/milestones/date-preview ─────────────────────
// Read-only: shows what would move if the wedding date changed.

router.post("/date-preview", requireAuth, requireWedding, async (req, res) => {
  const wedding = getAuthorizedResource<Wedding>(req);
  const parsed = DatePreviewBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const milestones = await loadMilestoneInputs(wedding.id);
  res.json(
    previewDateChange(
      milestones,
      wedding.weddingDate ?? null,
      parsed.data.weddingDate,
      resolveToday(req),
    ),
  );
});

// ── PATCH /api/weddings/:weddingId/milestones/:milestoneId ────────────────────

router.patch("/:milestoneId", requireAuth, requireWedding, async (req, res) => {
  const found = await milestoneFromParams(req, res);
  if (!found) return;
  const { wedding, milestone } = found;

  const parsed = UpdateMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const changes: Partial<InsertMilestone> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) changes.title = parsed.data.title;
  if (parsed.data.notes !== undefined) changes.notes = parsed.data.notes || null;
  if (parsed.data.status !== undefined && parsed.data.status !== milestone.status) {
    changes.status = parsed.data.status;
    changes.completedAt = parsed.data.status === "done" ? new Date() : null;
  }
  if (parsed.data.when !== undefined) {
    Object.assign(changes, scheduleFor(parsed.data.when));
  }

  await db
    .update(milestonesTable)
    .set(changes)
    .where(
      and(
        eq(milestonesTable.id, milestone.id),
        eq(milestonesTable.weddingId, wedding.id),
      ),
    );

  res.json({ journey: await loadJourney(wedding, resolveToday(req)) });
});

// ── DELETE /api/weddings/:weddingId/milestones/:milestoneId ───────────────────
// Only milestones the couple added. Starter milestones are skipped instead,
// so they can be brought back.

router.delete("/:milestoneId", requireAuth, requireWedding, async (req, res) => {
  const found = await milestoneFromParams(req, res);
  if (!found) return;
  const { wedding, milestone } = found;

  if (!milestone.isCustom) {
    res.status(409).json({
      error: "Starter milestones can be skipped, not deleted",
    });
    return;
  }

  await db
    .delete(milestonesTable)
    .where(
      and(
        eq(milestonesTable.id, milestone.id),
        eq(milestonesTable.weddingId, wedding.id),
      ),
    );

  res.json({ journey: await loadJourney(wedding, resolveToday(req)) });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

router.post(
  "/:milestoneId/tasks",
  requireAuth,
  requireWedding,
  async (req, res) => {
    const found = await milestoneFromParams(req, res);
    if (!found) return;
    const { wedding, milestone } = found;

    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const existing = await countTasks(milestone.id);
    if (existing >= MAX_TASKS_PER_MILESTONE) {
      res.status(409).json({
        error: `A milestone can hold up to ${MAX_TASKS_PER_MILESTONE} tasks`,
      });
      return;
    }

    await db.insert(milestoneTasksTable).values({
      milestoneId: milestone.id,
      title: parsed.data.title,
      position: existing,
    });

    res.status(201).json({ journey: await loadJourney(wedding, resolveToday(req)) });
  },
);

router.patch(
  "/:milestoneId/tasks/:taskId",
  requireAuth,
  requireWedding,
  async (req, res) => {
    const found = await milestoneFromParams(req, res);
    if (!found) return;
    const { wedding, milestone } = found;

    const taskId = parseId(req.params["taskId"]);
    if (taskId === null) {
      res.status(400).json({ error: "Invalid taskId" });
      return;
    }
    const parsed = UpdateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const task = await findTask(milestone.id, taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const changes: Partial<MilestoneTask> = {};
    if (parsed.data.title !== undefined) changes.title = parsed.data.title;
    if (parsed.data.done !== undefined && parsed.data.done !== (task.doneAt !== null)) {
      if (parsed.data.done) {
        const clerkUserId = (req as Request & { clerkUserId?: string }).clerkUserId;
        const user = clerkUserId ? await getAuthenticatedUser(clerkUserId) : null;
        changes.doneAt = new Date();
        changes.doneByUserId = user?.id ?? null;
      } else {
        changes.doneAt = null;
        changes.doneByUserId = null;
      }
    }

    if (Object.keys(changes).length > 0) {
      await db
        .update(milestoneTasksTable)
        .set(changes)
        .where(
          and(
            eq(milestoneTasksTable.id, task.id),
            eq(milestoneTasksTable.milestoneId, milestone.id),
          ),
        );
    }

    res.json({ journey: await loadJourney(wedding, resolveToday(req)) });
  },
);

router.delete(
  "/:milestoneId/tasks/:taskId",
  requireAuth,
  requireWedding,
  async (req, res) => {
    const found = await milestoneFromParams(req, res);
    if (!found) return;
    const { wedding, milestone } = found;

    const taskId = parseId(req.params["taskId"]);
    if (taskId === null) {
      res.status(400).json({ error: "Invalid taskId" });
      return;
    }
    const task = await findTask(milestone.id, taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    await db
      .delete(milestoneTasksTable)
      .where(
        and(
          eq(milestoneTasksTable.id, task.id),
          eq(milestoneTasksTable.milestoneId, milestone.id),
        ),
      );

    res.json({ journey: await loadJourney(wedding, resolveToday(req)) });
  },
);

export default router;
