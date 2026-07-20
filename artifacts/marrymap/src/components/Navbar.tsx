import { useClerk, useUser, Show } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function Navbar() {
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const [, setLocation] = useLocation();

  const handleSignOut = () => {
    signOut({ redirectUrl: basePath || "/" });
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="font-serif text-2xl font-medium tracking-tight text-primary">
          A Sam with a plan.
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-primary transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-primary transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
        </div>

        <div className="flex items-center gap-4">
          <Show when="signed-out">
            <Button
              variant="ghost"
              className="hidden sm:inline-flex"
              onClick={() => setLocation("/sign-in")}
            >
              Log in
            </Button>
            <Button onClick={() => setLocation("/sign-up")}>
              Start Planning
            </Button>
          </Show>

          <Show when="signed-in">
            {isLoaded && user && (
              <span className="text-sm text-muted-foreground hidden sm:block">
                {user.firstName ?? user.primaryEmailAddress?.emailAddress}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setLocation("/dashboard")}
            >
              Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </Show>
        </div>
      </div>
    </nav>
  );
}
