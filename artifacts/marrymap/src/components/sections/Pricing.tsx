import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-secondary border-t border-border/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-serif text-primary mb-6">
            A fraction of a planner's fee.
          </h2>
          <p className="text-lg text-muted-foreground">
            Cancel anytime. Most couples use Marrymap for 9-12 months leading up to their wedding.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Standard Tier */}
          <motion.div 
            className="bg-card rounded-2xl p-8 border border-border shadow-sm flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-8">
              <h3 className="text-2xl font-serif text-primary mb-2">Standard</h3>
              <p className="text-muted-foreground text-sm">For the beautifully organized affair.</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-medium text-primary">$29</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              {[
                "Full week-by-week timeline",
                "Vendor quote comparisons",
                "Budget tracking dashboard",
                "Email draft generator",
                "Guest list manager"
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-primary">
                  <Check className="w-5 h-5 text-accent shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" variant="default">
              Start Standard Plan
            </Button>
          </motion.div>

          {/* Complex Tier */}
          <motion.div 
            className="bg-primary rounded-2xl p-8 shadow-xl flex flex-col relative overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <svg width="200" height="200" viewBox="0 0 100 100" fill="currentColor">
                <path d="M50 0L61 39L100 50L61 61L50 100L39 61L0 50L39 39L50 0Z" />
              </svg>
            </div>

            <div className="mb-8 relative z-10">
              <h3 className="text-2xl font-serif text-primary-foreground mb-2">Complex</h3>
              <p className="text-primary-foreground/70 text-sm">For multi-day events and destination weddings.</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-medium text-primary-foreground">$99</span>
                <span className="text-primary-foreground/70">/month</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1 relative z-10">
              {[
                "Everything in Standard",
                "Multi-event timelines (Rehearsal, Brunch)",
                "Multiple currency support",
                "Bank transaction syncing",
                "Contract term analysis flagging"
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-primary-foreground">
                  <Check className="w-5 h-5 text-accent shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            
            <Button className="w-full bg-white text-primary hover:bg-white/90 relative z-10">
              Start Complex Plan
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
