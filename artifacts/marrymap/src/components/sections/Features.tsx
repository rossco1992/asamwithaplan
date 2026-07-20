import { motion } from "framer-motion";
import { Check, Mail, Sparkles, TrendingDown } from "lucide-react";

export function Features() {
  const features = [
    {
      title: "Week-by-week timeline",
      description: "Enter your date and venue. We generate a realistic, sequential plan. No more waking up at 3am wondering if you're supposed to book the florist yet.",
      icon: <Check className="w-5 h-5 text-accent" />,
    },
    {
      title: "Vendor quote comparison",
      description: "Line up competing quotes side by side. We'll automatically flag pricing that falls outside the normal range for your area.",
      icon: <TrendingDown className="w-5 h-5 text-accent" />,
    },
    {
      title: "Draft inquiry emails",
      description: "Stop staring at a blank screen. We'll draft initial inquiries and follow-ups in your voice, ready to send from your own inbox.",
      icon: <Mail className="w-5 h-5 text-accent" />,
    },
    {
      title: "Bank-synced budget tracking",
      description: "Connect your accounts to track actual spending against estimates. Catch overruns before they compound into a $5,000 problem.",
      icon: <Sparkles className="w-5 h-5 text-accent" />,
    }
  ];

  return (
    <section id="features" className="py-24 bg-card border-y border-border/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-4xl md:text-5xl font-serif text-primary mb-6">
              The intelligence of a professional, quiet in the background.
            </h2>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              A Sam with a plan isn't just a checklist. It's a system designed to catch the details that normally require a $10,000 planner to notice.
            </p>
            
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-12">
              {features.map((feature, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-primary">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </motion.div>
          
          <motion.div 
            className="relative lg:h-[600px] w-full rounded-2xl overflow-hidden bg-secondary border border-border/50 shadow-2xl shadow-primary/5"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Abstract UI representation */}
            <div className="absolute inset-0 bg-gradient-to-br from-card/80 to-secondary p-8 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-6 border-b border-border">
                <div>
                  <h4 className="font-serif text-xl font-medium">October 2024</h4>
                  <p className="text-xs text-muted-foreground mt-1">6 months out</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Est. Budget Remaining</p>
                  <p className="font-mono text-lg text-primary">$14,250</p>
                </div>
              </div>
              
              <div className="space-y-3 mt-4">
                {[
                  { task: "Finalize catering menu", status: "done" },
                  { task: "Send deposit to Florist", status: "active", alert: true },
                  { task: "Draft invitation wording", status: "pending" },
                  { task: "Book rental furniture", status: "pending" }
                ].map((item, i) => (
                  <div key={i} className={`p-4 rounded-lg flex items-center gap-4 border ${item.status === 'active' ? 'bg-card border-primary/20 shadow-sm' : 'bg-card/50 border-transparent'}`}>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${item.status === 'done' ? 'bg-primary border-primary' : 'border-border'}`}>
                      {item.status === 'done' && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className={`text-sm flex-1 ${item.status === 'done' ? 'text-muted-foreground line-through' : 'text-primary font-medium'}`}>
                      {item.task}
                    </span>
                    {item.alert && (
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-accent bg-accent/10 px-2 py-1 rounded-sm">
                        Due Today
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
