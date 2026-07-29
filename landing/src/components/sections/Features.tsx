import { motion } from "framer-motion";
import { Check, Mail, Sparkles, TrendingDown } from "lucide-react";

export function Features() {
  const features = [
    {
      title: "A week-by-week timeline",
      description: "Tell us your date and venue, and we'll lay out a realistic, sequential plan — so you always know what's next.",
      icon: <Check className="w-5 h-5 text-accent" />,
    },
    {
      title: "Vendor quote comparison",
      description: "Line up competing quotes side by side, with pricing that looks out of range for your area flagged automatically.",
      icon: <TrendingDown className="w-5 h-5 text-accent" />,
    },
    {
      title: "Draft inquiry emails",
      description: "No more staring at a blank screen — Sam will draft inquiries and follow-ups in your voice.",
      icon: <Mail className="w-5 h-5 text-accent" />,
    },
    {
      title: "Budget tracking",
      description: "Keep actual spending against your estimates, so overruns get caught early instead of compounding.",
      icon: <Sparkles className="w-5 h-5 text-accent" />,
    }
  ];

  return (
    <section id="features" className="py-24 bg-card border-y border-border/50">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-serif text-primary mb-6">
            What we're building.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            A Sam with a plan is still in the works. Here's what to expect at launch.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-12">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className="flex flex-col gap-3"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-primary">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
