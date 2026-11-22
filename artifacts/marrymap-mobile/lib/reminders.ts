/**
 * Milestone reminders, planned on the phone itself. Each partner's phone
 * works out its own reminders from the journey it last loaded, so nothing
 * here needs a server, a push service or a sign-up.
 *
 * Kept free of React Native imports so it runs under the plain Node test runner.
 */
import { formatDate, parseIsoDate, type Journey, type JourneyNode } from './journey';

export type ReminderKind = 'week-before' | 'due-day';

export interface PlannedReminder {
  /** Stable across runs, so the same plan never reschedules. */
  key: string;
  kind: ReminderKind;
  /** The local day the reminder fires, YYYY-MM-DD. */
  day: string;
  fireAt: Date;
  title: string;
  body: string;
  /** The milestone a tap opens, when the reminder is about just one. */
  milestoneId: number | null;
  milestoneIds: number[];
}

export interface PlanOptions {
  now?: Date;
  /** The hour of the day reminders fire, in the phone's time zone. */
  hour?: number;
  /**
   * iOS keeps at most 64 scheduled notifications per app, so only the
   * soonest ones are scheduled; the rest follow as the plan moves on.
   */
  limit?: number;
}

export const REMINDER_HOUR = 9;
export const REMINDER_LIMIT = 48;
const WEEK_DAYS = 7;

function addDays(day: string, days: number): string {
  const date = parseIsoDate(day);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fireTime(day: string, hour: number): Date {
  const date = parseIsoDate(day);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/** "Book the venue", "Book the venue and Send save-the-dates", "Book the venue and 2 more". */
function joinTitles(nodes: JourneyNode[]): string {
  if (nodes.length === 1) return nodes[0].title;
  if (nodes.length === 2) return `${nodes[0].title} and ${nodes[1].title}`;
  return `${nodes[0].title} and ${nodes.length - 1} more`;
}

function openTaskNote(nodes: JourneyNode[]): string {
  if (nodes.length !== 1) return '';
  const open = nodes[0].tasks.filter((task) => !task.done).length;
  if (open === 0) return '';
  return open === 1 ? ' 1 task left.' : ` ${open} tasks left.`;
}

function describe(kind: ReminderKind, day: string, dueDay: string, nodes: JourneyNode[]): { title: string; body: string } {
  const many = nodes.length > 1;
  if (kind === 'due-day') {
    return {
      title: many ? `${nodes.length} milestones due today` : `Due today: ${nodes[0].title}`,
      body: many ? `${joinTitles(nodes)}.` : `It's on your journey for today.${openTaskNote(nodes)}`,
    };
  }
  const when = formatDate(dueDay, { weekday: 'long', month: 'short', day: 'numeric' });
  return {
    title: many ? `${nodes.length} milestones due next week` : `Coming up: ${nodes[0].title}`,
    body: many ? `${joinTitles(nodes)}, all due ${when}.` : `Due ${when}.${openTaskNote(nodes)}`,
  };
}

/**
 * Plans a reminder a week before each open milestone is due and one on the
 * day. Milestones due on the same day share one reminder. Done and skipped
 * milestones, and ones with no date yet, get none. Reminders that would fire
 * in the past are dropped.
 */
export function planReminders(journey: Journey, options: PlanOptions = {}): PlannedReminder[] {
  const now = options.now ?? new Date();
  const hour = options.hour ?? REMINDER_HOUR;
  const limit = options.limit ?? REMINDER_LIMIT;

  // Group open, dated milestones by the day they're due.
  const byDueDay = new Map<string, JourneyNode[]>();
  for (const node of journey.nodes) {
    if (node.status !== 'todo' || !node.dueDate) continue;
    const list = byDueDay.get(node.dueDate) ?? [];
    list.push(node);
    byDueDay.set(node.dueDate, list);
  }

  const planned: PlannedReminder[] = [];
  for (const [dueDay, nodes] of byDueDay) {
    const ordered = [...nodes].sort((a, b) => a.id - b.id);
    const ids = ordered.map((node) => node.id);
    const kinds: { kind: ReminderKind; day: string }[] = [
      { kind: 'week-before', day: addDays(dueDay, -WEEK_DAYS) },
      { kind: 'due-day', day: dueDay },
    ];
    for (const { kind, day } of kinds) {
      const fireAt = fireTime(day, hour);
      if (fireAt.getTime() <= now.getTime()) continue;
      const { title, body } = describe(kind, day, dueDay, ordered);
      planned.push({
        key: `${kind}:${dueDay}:${ids.join(',')}:${title}:${body}`,
        kind,
        day,
        fireAt,
        title,
        body,
        milestoneId: ids.length === 1 ? ids[0] : null,
        milestoneIds: ids,
      });
    }
  }

  planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.key.localeCompare(b.key));
  return planned.slice(0, limit);
}

/** One string per plan, so a phone can tell when nothing changed and skip rescheduling. */
export function planSignature(planned: PlannedReminder[], hour: number = REMINDER_HOUR): string {
  return `${hour}|${planned.map((reminder) => reminder.key).join('|')}`;
}

/** How many open milestones have a date and so can be reminded about. */
export function remindableCount(journey: Journey): number {
  return journey.nodes.filter((node) => node.status === 'todo' && node.dueDate !== null).length;
}
