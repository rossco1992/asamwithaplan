import { useEffect, useState, useCallback } from "react";
import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { QuotesPage } from "./QuotesPage";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBase = basePath ? `${basePath}/api` : "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type WeddingStyle = "intimate" | "standard" | "large";
type Priority = "urgent" | "this-week" | "upcoming";

interface TimelineTask { title: string; priority: Priority; }
interface TimelineWeek { weekLabel: string; phase: string; tasks: TimelineTask[]; }
interface TimelineData { id: number; weddingId: number; generatedAt: string; tasks: TimelineWeek[]; }
interface WeddingData { id: number; weddingDate: string; city: string; guestCount: number; style: string; }

type DashboardState =
  | { kind: "form" }
  | { kind: "generating"; weddingId: number }
  | { kind: "failed"; weddingId: number; retriesRemaining: number }
  | { kind: "ready"; timeline: TimelineData; wedding: WeddingData };

type DashboardTab = "timeline" | "quotes";

// ── Priority badge ────────────────────────────────────────────────────────────

const priorityConfig: Record<Priority, { label: string; classes: string }> = {
  urgent:      { label: "Urgent",     classes: "bg-red-50 text-red-700 border-red-200" },
  "this-week": { label: "This week",  classes: "bg-accent/10 text-accent border-accent/20" },
  upcoming:    { label: "Upcoming",   classes: "bg-secondary text-muted-foreground border-border" },
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, classes } = priorityConfig[priority] ?? priorityConfig["upcoming"];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-semibold tracking-wider uppercase border ${classes}`}>
      {label}
    </span>
  );
}

// ── Timeline view ─────────────────────────────────────────────────────────────

function TimelineView({ timeline, wedding }: { timeline: TimelineData; wedding: WeddingData }) {
  const phases = Array.from(new Set(timeline.tasks.map((w) => w.phase)));
  const byPhase = Object.fromEntries(
    phases.map((p) => [p, timeline.tasks.filter((w) => w.phase === p)])
  );

  return (
    <div className="space-y-12">
      {phases.map((phase) => (
        <div key={phase}>
          <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-6 pb-2 border-b border-border">
            {phase}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byPhase[phase].map((week, i) => (
              <motion.div
                key={`${phase}-${i}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3"
              >
                <p className="text-xs font-medium text-muted-foreground">{week.weekLabel}</p>
                <ul className="space-y-2.5">
                  {week.tasks.map((task, j) => (
                    <li key={j} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-primary leading-snug">{task.title}</p>
                        <div className="mt-1">
                          <PriorityBadge priority={task.priority} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="space-y-10 animate-pulse">
      {[3, 4, 3].map((cols, pi) => (
        <div key={pi}>
          <div className="h-3 w-32 bg-secondary rounded mb-6" />
          <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`}>
            {Array.from({ length: cols }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5 space-y-3">
                <div className="h-2.5 w-24 bg-secondary rounded" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="space-y-1.5">
                    <div className="h-3 w-full bg-secondary rounded" />
                    <div className="h-4 w-16 bg-secondary/60 rounded" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Onboarding form ───────────────────────────────────────────────────────────

function OnboardingForm({ onSubmit }: { onSubmit: (weddingId: number) => void }) {
  const [weddingDate, setWeddingDate] = useState("");
  const [city, setCity] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [style, setStyle] = useState<WeddingStyle>("standard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/timelines/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weddingDate,
          city,
          guestCount: parseInt(guestCount, 10),
          style,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onSubmit(data.weddingId);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors";

  const styleOptions: { value: WeddingStyle; label: string; desc: string }[] = [
    { value: "intimate",  label: "Intimate",      desc: "Under 50 guests" },
    { value: "standard",  label: "Standard",      desc: "50–150 guests" },
    { value: "large",     label: "Large affair",  desc: "150+ guests" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-xl"
    >
      <p className="text-sm font-semibold tracking-widest uppercase text-accent mb-4">
        Let's get started
      </p>
      <h1 className="text-4xl md:text-5xl font-serif text-primary mb-3">
        Tell Sam about your wedding.
      </h1>
      <p className="text-muted-foreground mb-10 leading-relaxed">
        A few details is all she needs to build your complete week-by-week plan.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-primary">Wedding date</label>
          <input
            type="date"
            required
            value={weddingDate}
            onChange={(e) => setWeddingDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-primary">City or region</label>
          <input
            type="text"
            required
            placeholder="e.g. London, UK"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-primary">Estimated guest count</label>
          <input
            type="number"
            required
            placeholder="e.g. 80"
            min={1}
            max={10000}
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">Wedding style</label>
          <div className="grid grid-cols-3 gap-3">
            {styleOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStyle(opt.value)}
                className={`rounded-lg border px-4 py-3 text-left transition-all ${
                  style === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary/50 text-primary hover:border-primary/30"
                }`}
              >
                <p className="text-sm font-medium">{opt.label}</p>
                <p className={`text-xs mt-0.5 ${style === opt.value ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {opt.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full h-12 text-base">
          {loading ? "Submitting…" : "Build my timeline →"}
        </Button>
      </form>
    </motion.div>
  );
}

// ── Generating state ──────────────────────────────────────────────────────────

function GeneratingState() {
  const dots = [".", "..", "..."];
  const [dot, setDot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDot((d) => (d + 1) % 3), 600);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-xl"
    >
      <p className="text-sm font-semibold tracking-widest uppercase text-accent mb-4">
        Building your plan
      </p>
      <h1 className="text-4xl md:text-5xl font-serif text-primary mb-4">
        Sam is on it{dots[dot]}
      </h1>
      <p className="text-muted-foreground leading-relaxed mb-10">
        She's reviewing your wedding details and mapping out every task, week by week. This usually takes under 30 seconds.
      </p>
      <TimelineSkeleton />
    </motion.div>
  );
}

// ── Failed state ──────────────────────────────────────────────────────────────

function FailedState({ weddingId, retriesRemaining, onRetry }: { weddingId: number; retriesRemaining: number; onRetry: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    setError(null);
    setRetrying(true);
    try {
      const res = await fetch(`${apiBase}/timelines/${weddingId}/retry`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onRetry();
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-xl"
    >
      <p className="text-sm font-semibold tracking-widest uppercase text-red-500 mb-4">
        Something went wrong
      </p>
      <h1 className="text-4xl md:text-5xl font-serif text-primary mb-4">
        Sam hit a snag.
      </h1>
      <p className="text-muted-foreground leading-relaxed mb-8">
        The plan couldn't be generated this time. This is usually a temporary issue — give it another try.
      </p>

      {retriesRemaining > 0 ? (
        <>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              {error}
            </p>
          )}
          <Button onClick={handleRetry} disabled={retrying} className="h-12 px-8 text-base">
            {retrying ? "Trying again…" : "Try again →"}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            {retriesRemaining} attempt{retriesRemaining !== 1 ? "s" : ""} remaining
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground bg-secondary rounded-lg px-4 py-3 border border-border">
          No retries remaining. Please contact support if this keeps happening.
        </p>
      )}
    </motion.div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────────────────────

export function Dashboard() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [state, setState] = useState<DashboardState>({ kind: "form" });
  const [activeTab, setActiveTab] = useState<DashboardTab>("timeline");

  // JIT-provision DB user + load existing timeline on mount
  useEffect(() => {
    if (!isLoaded || !user) return;

    const provision = async () => {
      try {
        await fetch(`${apiBase}/users/me`, { method: "POST", credentials: "include" });
      } catch { /* best-effort */ }
    };

    const loadExisting = async () => {
      // Check if user already has a wedding/timeline by trying to generate
      // with a sentinel — actually, just try GET on a known wedding path.
      // We'll check via POST /timelines/generate — if it returns 200 (cached) or 202, we pick up there.
      // But we don't want to auto-submit the form. Instead, store weddingId in localStorage.
      const storedId = localStorage.getItem("sam_wedding_id");
      if (!storedId) return;
      const weddingId = parseInt(storedId, 10);
      if (isNaN(weddingId)) return;

      try {
        const res = await fetch(`${apiBase}/timelines/${weddingId}`, { credentials: "include" });
        const data = await res.json();
        if (data.status === "ready") {
          setState({ kind: "ready", timeline: data.timeline, wedding: data.wedding });
        } else if (data.status === "failed") {
          setState({ kind: "failed", weddingId, retriesRemaining: data.retriesRemaining ?? 3 });
        } else if (data.status === "generating") {
          setState({ kind: "generating", weddingId });
        }
      } catch { /* best-effort */ }
    };

    provision();
    loadExisting();
  }, [isLoaded, user]);

  // Poll when generating
  useEffect(() => {
    if (state.kind !== "generating") return;
    const { weddingId } = state;

    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/timelines/${weddingId}`, { credentials: "include" });
        const data = await res.json();
        if (data.status === "ready") {
          setState({ kind: "ready", timeline: data.timeline, wedding: data.wedding });
        } else if (data.status === "failed") {
          setState({ kind: "failed", weddingId, retriesRemaining: data.retriesRemaining ?? 3 });
        }
        // "generating" — keep polling
      } catch { /* keep polling */ }
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [state]);

  const handleFormSubmit = useCallback((weddingId: number) => {
    localStorage.setItem("sam_wedding_id", String(weddingId));
    setState({ kind: "generating", weddingId });
  }, []);

  const handleRetrySuccess = useCallback((weddingId: number) => {
    setState({ kind: "generating", weddingId });
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("sam_wedding_id");
    signOut({ redirectUrl: basePath || "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-serif text-xl font-medium text-primary tracking-tight">
            A Sam with a plan.
          </span>
          <div className="flex items-center gap-4">
            {isLoaded && user && (
              <span className="text-sm text-muted-foreground hidden sm:block">
                {user.firstName ?? user.primaryEmailAddress?.emailAddress}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {state.kind === "form" && (
            <motion.div key="form" exit={{ opacity: 0 }}>
              <OnboardingForm onSubmit={handleFormSubmit} />
            </motion.div>
          )}

          {state.kind === "generating" && (
            <motion.div key="generating" exit={{ opacity: 0 }}>
              <GeneratingState />
            </motion.div>
          )}

          {state.kind === "failed" && (
            <motion.div key="failed" exit={{ opacity: 0 }}>
              <FailedState
                weddingId={state.weddingId}
                retriesRemaining={state.retriesRemaining}
                onRetry={() => handleRetrySuccess(state.weddingId)}
              />
            </motion.div>
          )}

          {state.kind === "ready" && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Wedding summary + tab bar */}
              <div className="mb-8">
                <p className="text-sm font-semibold tracking-widest uppercase text-accent mb-3">
                  Your plan
                </p>
                <h1 className="text-4xl font-serif text-primary">
                  {state.wedding.city} · {new Date(state.wedding.weddingDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </h1>
                <p className="text-muted-foreground mt-2 mb-8">
                  {state.timeline.tasks.length} weeks · {state.wedding.guestCount} guests · {state.wedding.style}
                </p>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-border">
                  {(["timeline", "quotes"] as DashboardTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px capitalize ${
                        activeTab === tab
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-primary"
                      }`}
                    >
                      {tab === "timeline" ? "Timeline" : "Vendor Quotes"}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {activeTab === "timeline" && (
                  <motion.div
                    key="timeline-tab"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <TimelineView timeline={state.timeline} wedding={state.wedding} />
                  </motion.div>
                )}
                {activeTab === "quotes" && (
                  <motion.div
                    key="quotes-tab"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <QuotesPage weddingId={state.wedding.id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
