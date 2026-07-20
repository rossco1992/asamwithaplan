import { useEffect } from "react";
import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBase = basePath ? `${basePath}/api` : "/api";

export function Dashboard() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  // JIT-provision DB user row on first load
  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch(`${apiBase}/users/me`, { method: "POST", credentials: "include" }).catch(
      () => {/* silent — provisioning best-effort */}
    );
  }, [isLoaded, user]);

  const handleSignOut = () => {
    signOut({ redirectUrl: basePath || "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Dashboard Navbar */}
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-serif text-xl font-medium text-primary tracking-tight">
            A Sam with a plan.
          </span>
          <div className="flex items-center gap-4">
            {isLoaded && user && (
              <span className="text-sm text-muted-foreground hidden sm:block">
                {user.primaryEmailAddress?.emailAddress}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </nav>

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-widest uppercase text-accent mb-4">
            Your planning hub
          </p>
          <h1 className="text-4xl md:text-5xl font-serif text-primary mb-6">
            {isLoaded && user
              ? `Welcome${user.firstName ? `, ${user.firstName}` : ""}.`
              : "Welcome."}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Sam is getting your personalised wedding timeline ready. This is
            where your week-by-week plan, vendor comparisons, and budget
            tracker will live.
          </p>

          {/* Placeholder state */}
          <div className="mt-12 rounded-2xl border border-border bg-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <h2 className="font-serif text-xl text-primary mb-2">Your timeline is coming</h2>
            <p className="text-sm text-muted-foreground">
              Tell Sam about your wedding and she'll build your personalised
              week-by-week plan.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
