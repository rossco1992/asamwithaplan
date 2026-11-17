/**
 * Pure scheduling for the journey map. No database, no clock: callers pass
 * "today" so results are deterministic and the couple's local date is used,
 * not the server's.
 *
 * Dates are calendar dates as "YYYY-MM-DD" strings and all arithmetic is done
 * in UTC so daylight-saving changes never shift a due date.
 */

export type MilestoneSchedule = "relative" | "fixed";
export type MilestoneStatus = "todo" | "done" | "skipped";
export type MilestoneState =
  | "done"
  | "skipped"
  | "overdue"
  | "current"
  | "upcoming";

export type PhaseKey =
  | "twelve-plus"
  | "nine-to-twelve"
  | "six-to-nine"
  | "three-to-six"
  | "one-to-three"
  | "final-month"
  | "final-week"
  | "after-wedding"
  | "pinned";

export interface Phase {
  key: PhaseKey;
  label: string;
  /** Smallest weeks-before-the-wedding that still belongs to this phase. */
  minWeeks: number;
  /** Where a milestone added "somewhere in this phase" is scheduled. */
  defaultOffsetWeeks: number;
}

/** Ordered from furthest out to the wedding and beyond. */
const TIME_PHASES: readonly Phase[] = [
  { key: "twelve-plus", label: "12+ months", minWeeks: 52, defaultOffsetWeeks: 54 },
  { key: "nine-to-twelve", label: "9–12 months", minWeeks: 39, defaultOffsetWeeks: 45 },
  { key: "six-to-nine", label: "6–9 months", minWeeks: 26, defaultOffsetWeeks: 32 },
  { key: "three-to-six", label: "3–6 months", minWeeks: 13, defaultOffsetWeeks: 19 },
  { key: "one-to-three", label: "1–3 months", minWeeks: 5, defaultOffsetWeeks: 8 },
  { key: "final-month", label: "Final month", minWeeks: 2, defaultOffsetWeeks: 3 },
  { key: "final-week", label: "Final week", minWeeks: 0, defaultOffsetWeeks: 1 },
  {
    key: "after-wedding",
    label: "After the wedding",
    minWeeks: Number.NEGATIVE_INFINITY,
    defaultOffsetWeeks: -2,
  },
];

/**
 * Milestones pinned to a calendar date while the couple has no wedding date
 * yet. They can't be placed relative to the wedding, so they get their own
 * group, shown first.
 */
const PINNED_PHASE: Phase = {
  key: "pinned",
  label: "Your set dates",
  minWeeks: Number.NaN,
  defaultOffsetWeeks: 0,
};

export const PHASES: readonly Phase[] = [PINNED_PHASE, ...TIME_PHASES];

/** Phases a couple can drop a new milestone into (everything but pinned). */
export const SCHEDULABLE_PHASE_KEYS = TIME_PHASES.map((phase) => phase.key) as [
  PhaseKey,
  ...PhaseKey[],
];

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    parsed.getUTCFullYear() === Number(y) &&
    parsed.getUTCMonth() === Number(m) - 1 &&
    parsed.getUTCDate() === Number(d)
  );
}

function toUtcMs(date: string): number {
  if (!isIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function dueDateFor(
  weddingDate: string | null,
  offsetWeeks: number,
): string | null {
  if (!weddingDate) return null;
  return addDays(weddingDate, -offsetWeeks * 7);
}

export function phaseForWeeksBefore(weeksBefore: number): Phase {
  // TIME_PHASES is ordered by descending minWeeks, so the first match wins.
  return (
    TIME_PHASES.find((phase) => weeksBefore >= phase.minWeeks) ??
    TIME_PHASES[TIME_PHASES.length - 1]!
  );
}

export function getPhase(key: PhaseKey): Phase {
  const phase = PHASES.find((candidate) => candidate.key === key);
  if (!phase) throw new Error(`Unknown phase: ${key}`);
  return phase;
}

export interface MilestoneTaskInput {
  id: number;
  title: string;
  done: boolean;
}

export interface MilestoneInput {
  id: number;
  templateKey: string | null;
  title: string;
  notes: string | null;
  isCustom: boolean;
  schedule: MilestoneSchedule;
  offsetWeeks: number | null;
  fixedDate: string | null;
  status: MilestoneStatus;
  tasks: MilestoneTaskInput[];
}

export interface JourneyNode {
  id: number;
  templateKey: string | null;
  title: string;
  notes: string | null;
  isCustom: boolean;
  schedule: MilestoneSchedule;
  offsetWeeks: number | null;
  dueDate: string | null;
  phase: PhaseKey;
  status: MilestoneStatus;
  state: MilestoneState;
  isCurrent: boolean;
  tasks: MilestoneTaskInput[];
  tasksDone: number;
}

export interface JourneyPhase {
  key: PhaseKey;
  label: string;
  milestoneIds: number[];
}

export interface Journey {
  weddingDate: string | null;
  today: string;
  daysToGo: number | null;
  progress: { done: number; total: number; percent: number };
  currentMilestoneId: number | null;
  /** Ordered from first to do to last; the map draws them bottom to top. */
  nodes: JourneyNode[];
  /** Only phases that hold at least one milestone, in journey order. */
  phases: JourneyPhase[];
}

/**
 * Weeks before the wedding a milestone sits at. Relative milestones carry it;
 * fixed ones are measured from their date. A fixed milestone with no wedding
 * date has no position, so it returns null.
 */
function weeksBeforeWedding(
  milestone: MilestoneInput,
  weddingDate: string | null,
): number | null {
  if (milestone.schedule === "relative") return milestone.offsetWeeks ?? 0;
  if (!weddingDate || !milestone.fixedDate) return null;
  return Math.floor(daysBetween(milestone.fixedDate, weddingDate) / 7);
}

function resolveDueDate(
  milestone: MilestoneInput,
  weddingDate: string | null,
): string | null {
  if (milestone.schedule === "fixed") return milestone.fixedDate;
  return dueDateFor(weddingDate, milestone.offsetWeeks ?? 0);
}

interface Placed {
  milestone: MilestoneInput;
  dueDate: string | null;
  weeksBefore: number | null;
}

function compareByJourneyOrder(a: Placed, b: Placed): number {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  // Pinned milestones (a date but no wedding date) come first, by date.
  const aPinned = a.weeksBefore === null;
  const bPinned = b.weeksBefore === null;
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  // Otherwise further out from the wedding comes first.
  const aWeeks = a.weeksBefore ?? 0;
  const bWeeks = b.weeksBefore ?? 0;
  if (aWeeks !== bWeeks) return bWeeks - aWeeks;
  return a.milestone.id - b.milestone.id;
}

export function buildJourney(
  milestones: MilestoneInput[],
  weddingDate: string | null,
  today: string,
): Journey {
  if (!isIsoDate(today)) throw new Error(`Invalid today: ${today}`);

  const placed: Placed[] = milestones
    .map((milestone) => ({
      milestone,
      dueDate: resolveDueDate(milestone, weddingDate),
      weeksBefore: weeksBeforeWedding(milestone, weddingDate),
    }))
    .sort(compareByJourneyOrder);

  const current = placed.find(({ milestone }) => milestone.status === "todo");
  const currentMilestoneId = current?.milestone.id ?? null;

  const nodes: JourneyNode[] = placed.map(({ milestone, dueDate, weeksBefore }) => {
    const phase =
      weeksBefore === null ? PINNED_PHASE.key : phaseForWeeksBefore(weeksBefore).key;
    const isCurrent = milestone.id === currentMilestoneId;
    let state: MilestoneState;
    if (milestone.status === "done") state = "done";
    else if (milestone.status === "skipped") state = "skipped";
    else if (dueDate && dueDate < today) state = "overdue";
    else if (isCurrent) state = "current";
    else state = "upcoming";

    return {
      id: milestone.id,
      templateKey: milestone.templateKey,
      title: milestone.title,
      notes: milestone.notes,
      isCustom: milestone.isCustom,
      schedule: milestone.schedule,
      offsetWeeks: milestone.schedule === "relative" ? milestone.offsetWeeks : null,
      dueDate,
      phase,
      status: milestone.status,
      state,
      isCurrent,
      tasks: milestone.tasks,
      tasksDone: milestone.tasks.filter((task) => task.done).length,
    };
  });

  const phases: JourneyPhase[] = PHASES.map((phase) => ({
    key: phase.key,
    label: phase.label,
    milestoneIds: nodes
      .filter((node) => node.phase === phase.key)
      .map((node) => node.id),
  })).filter((phase) => phase.milestoneIds.length > 0);

  const counted = nodes.filter((node) => node.status !== "skipped");
  const done = counted.filter((node) => node.status === "done").length;
  const total = counted.length;

  return {
    weddingDate,
    today,
    daysToGo: weddingDate ? daysBetween(today, weddingDate) : null,
    progress: {
      done,
      total,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    },
    currentMilestoneId,
    nodes,
    phases,
  };
}

export interface DateChangeMove {
  id: number;
  title: string;
  from: string | null;
  to: string | null;
}

export interface DateChangePreview {
  /** Milestones that follow the wedding date and will move. */
  moved: DateChangeMove[];
  /** Fixed milestones that stay put but would now land after the wedding. */
  fixedAfterWedding: { id: number; title: string; date: string }[];
  /** Unfinished milestones whose new due date is already in the past. */
  nowOverdue: { id: number; title: string; dueDate: string }[];
}

/**
 * What changes if the wedding date changes. Nothing is written: the app shows
 * this to the couple before they confirm the new date.
 */
export function previewDateChange(
  milestones: MilestoneInput[],
  fromDate: string | null,
  toDate: string | null,
  today: string,
): DateChangePreview {
  const moved: DateChangeMove[] = [];
  const fixedAfterWedding: DateChangePreview["fixedAfterWedding"] = [];
  const nowOverdue: DateChangePreview["nowOverdue"] = [];

  for (const milestone of milestones) {
    if (milestone.schedule === "fixed") {
      if (
        toDate &&
        milestone.fixedDate &&
        milestone.fixedDate > toDate &&
        milestone.status === "todo"
      ) {
        fixedAfterWedding.push({
          id: milestone.id,
          title: milestone.title,
          date: milestone.fixedDate,
        });
      }
      continue;
    }

    const from = dueDateFor(fromDate, milestone.offsetWeeks ?? 0);
    const to = dueDateFor(toDate, milestone.offsetWeeks ?? 0);
    if (from !== to && milestone.status !== "skipped") {
      moved.push({ id: milestone.id, title: milestone.title, from, to });
    }
    if (to && to < today && milestone.status === "todo") {
      nowOverdue.push({ id: milestone.id, title: milestone.title, dueDate: to });
    }
  }

  return { moved, fixedAfterWedding, nowOverdue };
}
