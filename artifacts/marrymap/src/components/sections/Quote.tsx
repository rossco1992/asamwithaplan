import { motion } from "framer-motion";

export function Quote() {
  return (
    <section className="py-32 bg-primary text-primary-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay"></div>
      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg className="w-12 h-12 mx-auto text-accent mb-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
          <h2 className="text-3xl md:text-5xl font-serif leading-tight mb-8">
            "It feels like I have a Type-A best friend who happens to work in the wedding industry managing my spreadsheets."
          </h2>
          <div className="text-primary-foreground/70 text-sm font-medium tracking-wide uppercase">
            Sarah & Michael • Married September 2024
          </div>
        </motion.div>
      </div>
    </section>
  );
}
