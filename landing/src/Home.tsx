import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/sections/Hero";
import { Features } from "@/components/sections/Features";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Signup } from "@/components/sections/Signup";

export function Home() {
  return (
    <div className="min-h-screen relative selection:bg-accent/20">
      <div className="noise-overlay" />
      <Navbar />

      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Signup />
      </main>

      <footer className="bg-primary text-primary-foreground py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-serif text-2xl tracking-tight">A Sam with a plan.</div>
          <div className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} A Sam with a plan. The calm approach to wedding planning.
          </div>
        </div>
      </footer>
    </div>
  );
}
