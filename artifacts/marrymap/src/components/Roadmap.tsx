import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Flag, Heart, MapPin } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Priority = "urgent" | "this-week" | "upcoming";

export interface RoadmapTask {
  id?: string;
  title: string;
  priority: Priority;
}

export interface RoadmapWeek {
  weekLabel: string;
  phase: string;
  tasks: RoadmapTask[];
}

interface RoadmapProps {
  weeks: RoadmapWeek[];
  /** ISO timestamp — the day the couple started planning. Start of the road. */
  startedAt: string;
  /** YYYY-MM-DD — the wedding. End of the road. */
  weddingDate: string;
  completedTaskIds: Set<string>;
  onToggleTask: (taskId: string, completed: boolean) => void;
}

// ── Geometry ──────────────────────────────────────────────────────────────────
// The road is an explicit function of x — y(x) = CENTER_Y - AMP·cos(…) — rather
// than a fitted bezier. That means any marker (a milestone, the "you are here"
// pin) can be placed at its exact point on the curve with no path measuring.

const SPACING = 300; // horizontal gap between milestones
const PAD = 250; // x of the first milestone — leaves room for the start flag
const TAIL = 170; // road drawn before the first / after the last milestone
const AMP = 80; // how far the road swings above and below centre
// CENTER_Y and HEIGHT are sized for the tallest card a milestone can produce
// (3 tasks, all badged ≈ 240px) plus its gap to the road, on both sides.
const CENTER_Y = 380;
const HEIGHT = 760;
const CARD_W = 248;
const CARD_GAP = 38; // gap between a milestone dot and its card

/** Milestone i alternates between a crest (i even) and a trough (i odd). */
function roadY(x: number): number {
  return CENTER_Y - AMP * Math.cos(((x - PAD) / SPACING) * Math.PI);
}

function milestoneX(index: number): number {
  return PAD + index * SPACING;
}

/** Samples the curve densely enough that it reads as smooth at any zoom. */
function buildRoadPath(x0: number, x1: number): string {
  const step = 6;
  const points: string[] = [];
  for (let x = x0; x < x1; x += step) {
    points.push(`${x.toFixed(1)},${roadY(x).toFixed(1)}`);
  }
  points.push(`${x1.toFixed(1)},${roadY(x1).toFixed(1)}`);
  return `M ${points.join(" L ")}`;
}

// ── Priority badge ────────────────────────────────────────────────────────────

const priorityConfig: Record<Priority, { label: string; classes: string }> = {
  urgent: { label: "Urgent", classes: "bg-red-50 text-red-700 border-red-200" },
  "this-week": { label: "This week", classes: "bg-accent/10 text-accent border-accent/20" },
  upcoming: { label: "Upcoming", classes: "bg-secondary text-muted-foreground border-border" },
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, classes } = priorityConfig[priority] ?? priorityConfig.upcoming;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-semibold tracking-wider uppercase border ${classes}`}
    >
      {label}
    </span>
  );
}

// ── Milestone card ────────────────────────────────────────────────────────────

function MilestoneCard({
  week,
  weekIndex,
  above,
  taskIds,
  completedTaskIds,
  onToggleTask,
}: {
  week: RoadmapWeek;
  weekIndex: number;
  above: boolean;
  taskIds: string[];
  completedTaskIds: Set<string>;
  onToggleTask: (taskId: string, completed: boolean) => void;
}) {
  const doneCount = taskIds.filter((id) => completedTaskIds.has(id)).length;
  const allDone = doneCount === taskIds.length && taskIds.length > 0;

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition-colors ${
        allDone ? "bg-accent/5 border-accent/30" : "bg-card border-border"
      }`}
      style={{ width: CARD_W }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-primary">{week.weekLabel}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {doneCount}/{taskIds.length}
        </p>
      </div>
      <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-3">
        {week.phase}
      </p>

      <ul className="space-y-2.5">
        {week.tasks.map((task, taskIndex) => {
          const taskId = taskIds[taskIndex];
          const done = completedTaskIds.has(taskId);
          return (
            <li key={taskId}>
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => onToggleTask(taskId, e.target.checked)}
                  className="sr-only peer"
                />
                <span
                  aria-hidden="true"
                  className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 ${
                    done
                      ? "bg-accent border-accent text-accent-foreground"
                      : "border-border bg-background group-hover:border-accent"
                  }`}
                >
                  {done && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={`block text-sm leading-snug transition-colors ${
                      done ? "text-muted-foreground line-through" : "text-primary"
                    }`}
                  >
                    {task.title}
                  </span>
                  {/* "Upcoming" is the default state of most tasks — badging it
                      adds a line of noise to every row and buries the two
                      priorities that actually want attention. */}
                  {!done && task.priority !== "upcoming" && (
                    <span className="block mt-1">
                      <PriorityBadge priority={task.priority} />
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {/* Connector from the card to its dot on the road */}
      <div
        aria-hidden="true"
        className={`absolute left-1/2 -translate-x-1/2 w-px bg-border ${above ? "top-full" : "bottom-full"}`}
        style={{ height: CARD_GAP - 10 }}
      />
      <span className="sr-only">Milestone {weekIndex + 1}</span>
    </div>
  );
}

// ── Roadmap ───────────────────────────────────────────────────────────────────

export function Roadmap({
  weeks,
  startedAt,
  weddingDate,
  completedTaskIds,
  onToggleTask,
}: RoadmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [hasScrolled, setHasScrolled] = useState(false);

  // Stable ids per task, mirroring the server's `timelineTaskId` fallback so a
  // timeline generated before ids existed still ticks off correctly.
  const taskIdsByWeek = useMemo(
    () =>
      weeks.map((week, weekIndex) =>
        week.tasks.map((task, taskIndex) => task.id ?? `w${weekIndex}t${taskIndex}`),
      ),
    [weeks],
  );

  const allTaskIds = useMemo(() => taskIdsByWeek.flat(), [taskIdsByWeek]);
  const doneCount = allTaskIds.filter((id) => completedTaskIds.has(id)).length;
  const completionFraction = allTaskIds.length > 0 ? doneCount / allTaskIds.length : 0;

  const x0 = PAD - TAIL;
  const x1 = milestoneX(Math.max(weeks.length - 1, 0)) + TAIL;
  const totalWidth = x1 + TAIL;
  const roadPath = useMemo(() => buildRoadPath(x0, x1), [x0, x1]);

  // "You are here" — where today sits between the day planning started and the
  // wedding. Purely time-based; the road's fill tracks completion separately.
  const { pinX, pinY, daysToGo, elapsedFraction } = useMemo(() => {
    const start = new Date(startedAt).getTime();
    const end = new Date(`${weddingDate}T12:00:00`).getTime();
    const now = Date.now();
    const span = end - start;
    const fraction = span > 0 ? Math.min(Math.max((now - start) / span, 0), 1) : 1;
    const x = x0 + fraction * (x1 - x0);
    return {
      pinX: x,
      pinY: roadY(x),
      daysToGo: Math.max(Math.ceil((end - now) / 86_400_000), 0),
      elapsedFraction: fraction,
    };
  }, [startedAt, weddingDate, x0, x1]);

  // Road above the centre line means we're on a crest, whose card sits above —
  // so the pin drops below, and vice versa.
  const pinBelowRoad = pinY < CENTER_Y;

  // Open on the couple's current position rather than at the very beginning —
  // the useful part of the road is where they actually are.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || hasScrolled) return;
    const target = Math.max(pinX - el.clientWidth / 2, 0);
    el.scrollTo({ left: target, behavior: reduceMotion ? "auto" : "smooth" });
    setHasScrolled(true);
  }, [pinX, hasScrolled, reduceMotion]);

  return (
    <div>
      {/* Progress summary */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-6">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-serif text-primary tabular-nums">{doneCount}</span>
          <span className="text-sm text-muted-foreground">
            of {allTaskIds.length} done
          </span>
        </div>
        <div className="h-1.5 flex-1 min-w-[140px] max-w-xs bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-full"
            initial={false}
            animate={{ width: `${completionFraction * 100}%` }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {daysToGo === 0 ? "Today's the day" : `${daysToGo} days to go`}
        </p>
      </div>

      {/* The road */}
      {/* Mandatory snapping on phones, where one milestone fills the screen and
          stop-to-stop is the whole point; proximity on desktop, where several
          are visible at once and hard snapping just fights the user. */}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-2xl border border-border bg-secondary/30 snap-x snap-mandatory md:snap-proximity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        style={{ WebkitOverflowScrolling: "touch" }}
        role="region"
        tabIndex={0}
        aria-label="Your wedding planning roadmap — scroll sideways to move through time"
      >
        <div className="relative" style={{ width: totalWidth, height: HEIGHT }}>
          <svg
            width={totalWidth}
            height={HEIGHT}
            viewBox={`0 0 ${totalWidth} ${HEIGHT}`}
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
          >
            {/* Unwalked road */}
            <path
              d={roadPath}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={16}
              strokeLinecap="round"
            />
            {/* Dashed centre line, so it reads as a road rather than a ribbon */}
            <path
              d={roadPath}
              fill="none"
              stroke="hsl(var(--background))"
              strokeWidth={2}
              strokeDasharray="10 14"
              strokeLinecap="round"
              opacity={0.9}
            />
            {/* Walked road — pathLength normalises the curve to 1 so the fill is
                a plain fraction with no getTotalLength() measuring. */}
            <motion.path
              d={roadPath}
              fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth={16}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              initial={false}
              animate={{ strokeDashoffset: 1 - completionFraction }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>

          {/* Start cap */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 snap-start"
            style={{ left: x0, top: roadY(x0) }}
          >
            <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
              <Flag className="w-4 h-4" />
            </span>
            <div className="text-center whitespace-nowrap">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                You started
              </p>
              <p className="text-xs text-primary">
                {new Date(startedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Milestones */}
          {weeks.map((week, weekIndex) => {
            const x = milestoneX(weekIndex);
            const y = roadY(x);
            const above = weekIndex % 2 === 0; // crests take cards above
            const taskIds = taskIdsByWeek[weekIndex];
            const allDone =
              taskIds.length > 0 && taskIds.every((id) => completedTaskIds.has(id));
            const isNext = x >= pinX && (weekIndex === 0 || milestoneX(weekIndex - 1) < pinX);

            return (
              <div key={weekIndex}>
                {/* Dot on the road. This carries the scroll-snap target: it sits
                    at the milestone's x, whereas this wrapper is a zero-width
                    box in flow and would snap every milestone to x=0. */}
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 snap-center"
                  style={{ left: x, top: y }}
                >
                  <motion.span
                    initial={reduceMotion ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { delay: Math.min(weekIndex * 0.03, 0.4), duration: 0.35, ease: [0.16, 1, 0.3, 1] }
                    }
                    className={`block w-6 h-6 rounded-full border-4 flex items-center justify-center ${
                      allDone
                        ? "bg-accent border-accent text-accent-foreground"
                        : isNext
                          ? "bg-background border-accent"
                          : "bg-background border-border"
                    }`}
                  >
                    {allDone && <Check className="w-3 h-3" strokeWidth={4} />}
                  </motion.span>
                </div>

                {/* Card, offset above or below the dot. The anchoring transform
                    lives on this outer div so it can't collide with the
                    transform Framer Motion drives on the inner one. */}
                <div
                  className="absolute"
                  style={{
                    left: x,
                    top: above ? y - CARD_GAP : y + CARD_GAP,
                    transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
                  }}
                >
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: above ? -8 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { delay: Math.min(weekIndex * 0.03, 0.4), duration: 0.4, ease: [0.16, 1, 0.3, 1] }
                    }
                    className="relative"
                  >
                    <MilestoneCard
                      week={week}
                      weekIndex={weekIndex}
                      above={above}
                      taskIds={taskIds}
                      completedTaskIds={completedTaskIds}
                      onToggleTask={onToggleTask}
                    />
                  </motion.div>
                </div>
              </div>
            );
          })}

          {/* "You are here" pin. Milestone cards sit on the outside of each
              bend — above a crest, below a trough — so the pin goes to the
              inside, where nothing else is competing for the space. */}
          <div
            className="absolute -translate-x-1/2 z-20 pointer-events-none"
            style={{ left: pinX, top: pinBelowRoad ? pinY + 4 : pinY - 58 }}
          >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: pinBelowRoad ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { delay: 0.3, duration: 0.4 }}
              className={`flex items-center ${pinBelowRoad ? "flex-col-reverse" : "flex-col"}`}
            >
              <span className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold tracking-wider uppercase whitespace-nowrap shadow-md">
                You are here
              </span>
              <MapPin
                className={`w-5 h-5 text-primary ${pinBelowRoad ? "rotate-180 -mb-0.5" : "-mt-0.5"}`}
                fill="currentColor"
              />
            </motion.div>
          </div>

          {/* The altar */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 snap-end"
            style={{ left: x1, top: roadY(x1) }}
          >
            <motion.span
              initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={reduceMotion ? { duration: 0 } : { delay: 0.45, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${
                elapsedFraction >= 1
                  ? "bg-accent text-accent-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              <Heart className="w-6 h-6" fill="currentColor" />
            </motion.span>
            <div className="text-center whitespace-nowrap">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-accent">
                The altar
              </p>
              <p className="text-sm font-serif text-primary">
                {new Date(`${weddingDate}T12:00:00`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Scroll sideways to travel from the day you started to the day you say I do.
      </p>
    </div>
  );
}
