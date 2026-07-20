import { motion } from "framer-motion";

export function Financials() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2 
            className="text-4xl md:text-5xl font-serif text-primary mb-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Protect your budget with <span className="italic text-accent">precision.</span>
          </motion.h2>
          <motion.p 
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Weddings run over budget when small additions compound unseen. A Sam with a plan brings dashboard-level financial tracking to your wedding fund.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              title: "Quote Analyzer",
              value: "-12%",
              label: "Average savings",
              desc: "Upload vendor quotes. We normalize line items to ensure you are comparing apples to apples across caterers."
            },
            {
              title: "Live Tracking",
              value: "Real-time",
              label: "Bank syncing",
              desc: "Connect your bank. Every deposit and final payment is logged automatically against your master ledger."
            },
            {
              title: "Smart Alerts",
              value: "$0",
              label: "Surprise fees",
              desc: "We flag hidden costs like service charges, cake cutting fees, and mandatory gratuties before you sign."
            }
          ].map((card, i) => (
            <motion.div 
              key={i}
              className="bg-card border border-border rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <h3 className="text-xl font-medium text-primary mb-6">{card.title}</h3>
              <div className="mb-6 pb-6 border-b border-border/50">
                <p className="font-mono text-4xl text-accent mb-1">{card.value}</p>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {card.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
