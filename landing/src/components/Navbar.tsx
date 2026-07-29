import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <a href="#" className="font-serif text-2xl font-medium tracking-tight text-primary">
          A Sam with a plan.
        </a>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-primary transition-colors">What's coming</a>
          <a href="#how-it-works" className="hover:text-primary transition-colors">How it'll work</a>
        </div>

        <Button asChild size="sm">
          <a href="#signup">Join the waitlist</a>
        </Button>
      </div>
    </nav>
  );
}
