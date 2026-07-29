import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

// Set VITE_FORM_ENDPOINT in landing/.env to a form-submission endpoint
// (e.g. a free Formspree form: https://formspree.io/f/xxxxxxxx) before
// deploying. See landing/README.md for setup steps.
const FORM_ENDPOINT = import.meta.env.VITE_FORM_ENDPOINT as string | undefined;

type Status = "idle" | "submitting" | "success" | "error" | "unconfigured";

export function Signup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!FORM_ENDPOINT) {
      setStatus("unconfigured");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section id="signup" className="py-24 bg-secondary border-t border-border/50">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
            <Mail className="w-5 h-5 text-accent" />
          </div>
          <h2 className="text-3xl md:text-4xl font-serif text-primary mb-4">
            Be the first to know when we launch.
          </h2>
          <p className="text-muted-foreground mb-8">
            No spam, just one email when A Sam with a plan opens up.
          </p>

          {status === "success" ? (
            <p className="text-primary font-medium">You're on the list — talk soon!</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 h-11 px-4 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" disabled={status === "submitting"}>
                {status === "submitting" ? "Joining…" : "Join the waitlist"}
              </Button>
            </form>
          )}

          {status === "error" && (
            <p className="text-destructive text-sm mt-4">
              Something went wrong — mind trying again in a moment?
            </p>
          )}
          {status === "unconfigured" && (
            <p className="text-destructive text-sm mt-4">
              Signup form isn't connected yet — set VITE_FORM_ENDPOINT (see landing/README.md).
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
