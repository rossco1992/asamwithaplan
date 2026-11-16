/**
 * Types and helpers for the journey map. The shapes mirror
 * GET /api/weddings/:weddingId/milestones on the API server.
 */

export type MilestoneStatus = 'todo' | 'done' | 'skipped';
export type MilestoneState = 'done' | 'skipped' | 'overdue' | 'current' | 'upcoming';

export type PhaseKey =
  | 'pinned'
  | 'twelve-plus'
  | 'nine-to-twelve'
  | 'six-to-nine'
  | 'three-to-six'
  | 'one-to-three'
  | 'final-month'
  | 'final-week'
  | 'after-wedding';

export interface MilestoneTask {
  id: number;
  title: string;
  done: boolean;
}

export interface JourneyNode {
  id: number;
  templateKey: string | null;
  title: string;
  notes: string | null;
  isCustom: boolean;
  schedule: 'relative' | 'fixed';
  offsetWeeks: number | null;
  dueDate: string | null;
  phase: PhaseKey;
  status: MilestoneStatus;
  state: MilestoneState;
  isCurrent: boolean;
  tasks: MilestoneTask[];
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
  nodes: JourneyNode[];
  phases: JourneyPhase[];
}

/** Phases a couple can drop a new milestone into, in journey order. */
export const SCHEDULABLE_PHASES: { key: PhaseKey; label: string }[] = [
  { key: 'twelve-plus', label: '12+ months' },
  { key: 'nine-to-twelve', label: '9–12 months' },
  { key: 'six-to-nine', label: '6–9 months' },
  { key: 'three-to-six', label: '3–6 months' },
  { key: 'one-to-three', label: '1–3 months' },
  { key: 'final-month', label: 'Final month' },
  { key: 'final-week', label: 'Final week' },
  { key: 'after-wedding', label: 'After the wedding' },
];

export type MilestoneWhen =
  | { kind: 'date'; date: string }
  | { kind: 'phase'; phase: PhaseKey };

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Today on the couple's own calendar, as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

/** Parses YYYY-MM-DD at local noon so no time zone can shift the day. */
export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  try {
    return parseIsoDate(value).toLocaleDateString('en-US', options);
  } catch {
    return value;
  }
}

export function formatLongDate(value: string): string {
  return formatDate(value, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function stateLabel(state: MilestoneState): string {
  switch (state) {
    case 'done':
      return 'Done';
    case 'skipped':
      return 'Skipped';
    case 'overdue':
      return 'Overdue';
    case 'current':
      return 'Up next';
    default:
      return 'Upcoming';
  }
}

/** One sentence VoiceOver reads for a stop on the map or in the list. */
export function accessibilityLabelFor(node: JourneyNode): string {
  const parts = [node.title];
  if (node.dueDate) parts.push(`due ${formatLongDate(node.dueDate)}`);
  parts.push(stateLabel(node.state).toLowerCase());
  if (node.tasks.length > 0) {
    parts.push(`${node.tasksDone} of ${node.tasks.length} tasks done`);
  }
  if (node.isCustom) parts.push('added by you');
  return parts.join(', ');
}

export function initialsFor(name: string | null | undefined): string {
  if (!name) return '♡';
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return letters || '♡';
}
