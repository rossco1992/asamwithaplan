import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/sections/Hero";
import { Features } from "@/components/sections/Features";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Financials } from "@/components/sections/Financials";
import { Quote } from "@/components/sections/Quote";
import { Pricing } from "@/components/sections/Pricing";
import { CTA } from "@/components/sections/CTA";

export function LandingPage() {
  return (
    <div className="min-h-screen relative selection:bg-accent/20">
      <div className="noise-overlay" />
      <Navbar />
      
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Quote />
        <Financials />
        <Pricing />
        <CTA />
      </main>
      
      <footer className="bg-primary text-primary-foreground py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-serif text-2xl tracking-tight">Marrymap.</div>
          <div className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} Marrymap Inc. The calm approach to wedding planning.
          </div>
        </div>
      </footer>
    </div>
  );
}
