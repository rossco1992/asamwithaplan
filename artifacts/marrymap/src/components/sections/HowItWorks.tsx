import { motion } from "framer-motion";

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Input the basics",
      desc: "Tell us your date, location, and guest count estimate. That's all we need to generate a master timeline."
    },
    {
      number: "02",
      title: "Follow the plan",
      desc: "Each week, you get exactly what needs to be done. No massive checklists, just the next right step."
    },
    {
      number: "03",
      title: "Forward the emails",
      desc: "When vendors send contracts or quotes, forward them to your Marrymap address. We extract the data."
    },
    {
      number: "04",
      title: "Stay in control",
      desc: "Review comparisons, track your spending against the budget, and make informed decisions with confidence."
    }
  ];

  return (
    <section id="how-it-works" className="py-24 bg-card">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <motion.h2 
            className="text-4xl md:text-5xl font-serif text-primary mb-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            How it works
          </motion.h2>
        </div>

        <div className="grid md:grid-cols-4 gap-8 relative">
          {/* Connecting line for desktop */}
          <div className="hidden md:block absolute top-[28px] left-12 right-12 h-[1px] bg-border z-0" />
          
          {steps.map((step, i) => (
            <motion.div 
              key={i}
              className="relative z-10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
            >
              <div className="w-14 h-14 rounded-full bg-card border-2 border-primary text-primary flex items-center justify-center font-serif text-xl mb-6 mx-auto md:mx-0 shadow-[0_0_0_4px_hsl(var(--card))]">
                {step.number}
              </div>
              <h3 className="text-xl font-medium text-primary mb-3 text-center md:text-left">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed text-center md:text-left">
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
