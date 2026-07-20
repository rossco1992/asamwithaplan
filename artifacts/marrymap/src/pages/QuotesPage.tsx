import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBase = basePath ? `${basePath}/api` : "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VendorCategory =
  | "catering" | "flowers" | "photography" | "videography"
  | "music" | "venue" | "transportation" | "cake"
  | "hair_makeup" | "officiant" | "other";

export const categoryLabels: Record<VendorCategory, string> = {
  catering: "Catering",
  flowers: "Flowers & Florals",
  photography: "Photography",
  videography: "Videography",
  music: "Music & DJ",
  venue: "Venue",
  transportation: "Transportation",
  cake: "Wedding Cake",
  hair_makeup: "Hair & Makeup",
  officiant: "Officiant",
  other: "Other",
};

const allCategories = Object.keys(categoryLabels) as VendorCategory[];

export interface QuoteLineItem {
  item: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id: number;
  weddingId: number;
  vendorName: string;
  category: VendorCategory;
  rawText: string;
  lineItems: QuoteLineItem[];
  totalAmount: number;
  currency: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Returns true if the amount is >20% above the median of the group. */
function isOverpriced(amount: number, groupAmounts: number[]): boolean {
  if (groupAmounts.length < 2) return false;
  const sorted = [...groupAmounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  return amount > median * 1.2;
}

// ── Add Quote Form ────────────────────────────────────────────────────────────

interface AddQuoteFormProps {
  weddingId: number;
  onAdded: (quote: Quote) => void;
  onCancel: () => void;
}

type InputMode = "text" | "pdf";

function AddQuoteForm({ weddingId, onAdded, onCancel }: AddQuoteFormProps) {
  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState<VendorCategory>("catering");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [rawText, setRawText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (inputMode === "pdf" && !pdfFile) {
      setError("Please select a PDF file to upload.");
      return;
    }
    if (inputMode === "text" && rawText.trim().length < 10) {
      setError("Please paste at least 10 characters of quote text.");
      return;
    }

    setLoading(true);
    try {
      let res: Response;

      if (inputMode === "pdf" && pdfFile) {
        const form = new FormData();
        form.append("weddingId", String(weddingId));
        form.append("vendorName", vendorName);
        form.append("category", category);
        form.append("pdf", pdfFile);
        res = await fetch(`${apiBase}/quotes`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
      } else {
        res = await fetch(`${apiBase}/quotes`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weddingId, vendorName, category, rawText }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onAdded(data.quote as Quote);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors";

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-primary"
    }`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="bg-card rounded-2xl border border-border p-6 mb-8"
    >
      <h3 className="text-base font-semibold text-primary mb-5">Add a vendor quote</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendor name</label>
            <input
              type="text"
              required
              placeholder="e.g. Bloom & Co."
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as VendorCategory)}
              className={inputClass}
            >
              {allCategories.map((c) => (
                <option key={c} value={c}>{categoryLabels[c]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Input mode tabs */}
        <div className="space-y-3">
          <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
            <button
              type="button"
              className={tabClass(inputMode === "text")}
              onClick={() => setInputMode("text")}
            >
              Paste text
            </button>
            <button
              type="button"
              className={tabClass(inputMode === "pdf")}
              onClick={() => setInputMode("pdf")}
            >
              Upload PDF
            </button>
          </div>

          <AnimatePresence mode="wait">
            {inputMode === "text" ? (
              <motion.div
                key="text"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <textarea
                  rows={6}
                  placeholder="Paste the vendor email or quote here — Sam will extract all line items automatically."
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className={`${inputClass} resize-none`}
                />
              </motion.div>
            ) : (
              <motion.div
                key="pdf"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <label className="flex flex-col items-center justify-center gap-3 w-full rounded-lg border-2 border-dashed border-border bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer px-6 py-8">
                  <span className="text-2xl">📄</span>
                  <div className="text-center">
                    {pdfFile ? (
                      <>
                        <p className="text-sm font-medium text-primary">{pdfFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(pdfFile.size / 1024).toFixed(0)} KB · Click to change
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-primary">Click to select a PDF</p>
                        <p className="text-xs text-muted-foreground mt-0.5">or drag and drop — max 10 MB</p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setPdfFile(file);
                      setError(null);
                    }}
                  />
                </label>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={loading} className="flex-1 sm:flex-none sm:w-48">
            {loading ? "Sam is reading…" : "Parse quote →"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

// ── Quote Card ────────────────────────────────────────────────────────────────

interface QuoteCardProps {
  quote: Quote;
  overpriced: boolean;
  onDelete: (id: number) => void;
}

function QuoteCard({ quote, overpriced, onDelete }: QuoteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Remove quote from ${quote.vendorName}?`)) return;
    setDeleting(true);
    try {
      await fetch(`${apiBase}/quotes/${quote.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      onDelete(quote.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`bg-card rounded-xl border p-5 flex flex-col gap-3 transition-colors ${
        overpriced ? "border-amber-300/60" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary truncate">{quote.vendorName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(quote.createdAt).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-base font-semibold text-primary">
            {fmt(quote.totalAmount, quote.currency)}
          </span>
          {overpriced && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-semibold tracking-wider uppercase bg-amber-50 text-amber-700 border border-amber-200">
              ⚠ Above market
            </span>
          )}
        </div>
      </div>

      {/* Line items toggle */}
      {quote.lineItems.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-accent hover:text-accent/80 transition-colors text-left"
        >
          {expanded ? "Hide" : "Show"} {quote.lineItems.length} line item{quote.lineItems.length !== 1 ? "s" : ""}
        </button>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-border overflow-hidden text-xs">
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Item</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">Qty</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">Unit</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.map((li, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-3 py-2 text-primary">{li.item}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{li.quantity}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {fmt(li.unitPrice, quote.currency)}
                      </td>
                      <td className="px-3 py-2 text-right text-primary font-medium">
                        {fmt(li.total, quote.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete */}
      <div className="flex justify-end pt-1 border-t border-border/40">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
        >
          {deleting ? "Removing…" : "Remove"}
        </button>
      </div>
    </motion.div>
  );
}

// ── Category Group ────────────────────────────────────────────────────────────

function CategoryGroup({ category, quotes, onDelete }: {
  category: VendorCategory;
  quotes: Quote[];
  onDelete: (id: number) => void;
}) {
  const amounts = quotes.map((q) => q.totalAmount);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border">
        <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          {categoryLabels[category]}
        </h3>
        <span className="text-xs text-muted-foreground/60">
          {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
        </span>
        {quotes.length >= 2 && (
          <span className="text-xs text-muted-foreground/60 ml-auto">
            Median: {fmt(
              (() => {
                const sorted = [...amounts].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 !== 0
                  ? sorted[mid]
                  : (sorted[mid - 1] + sorted[mid]) / 2;
              })(),
              quotes[0].currency
            )}
          </span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {quotes.map((q) => (
            <QuoteCard
              key={q.id}
              quote={q}
              overpriced={isOverpriced(q.totalAmount, amounts)}
              onDelete={onDelete}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main QuotesPage ───────────────────────────────────────────────────────────

interface QuotesPageProps {
  weddingId: number;
}

export function QuotesPage({ weddingId }: QuotesPageProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/quotes?weddingId=${weddingId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setQuotes(data.quotes as Quote[]);
      }
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const handleAdded = (quote: Quote) => {
    setQuotes((prev) => [...prev, quote]);
    setShowForm(false);
  };

  const handleDelete = (id: number) => {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  };

  // Group by category, in the order they appear
  const categoriesWithQuotes = allCategories.filter((c) =>
    quotes.some((q) => q.category === c)
  );
  const byCategory: Record<string, Quote[]> = {};
  for (const q of quotes) {
    if (!byCategory[q.category]) byCategory[q.category] = [];
    byCategory[q.category].push(q);
  }

  const overpricedCount = quotes.filter((q) => {
    const group = byCategory[q.category] ?? [];
    return isOverpriced(q.totalAmount, group.map((g) => g.totalAmount));
  }).length;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm font-semibold tracking-widest uppercase text-accent mb-1">
            Vendor quotes
          </p>
          <h2 className="text-3xl font-serif text-primary">
            Compare & spot overpriced offers
          </h2>
          {overpricedCount > 0 && (
            <p className="text-sm text-amber-600 mt-2">
              ⚠ {overpricedCount} quote{overpricedCount !== 1 ? "s are" : " is"} above market price for your area
            </p>
          )}
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          variant={showForm ? "outline" : "default"}
          className="shrink-0"
        >
          {showForm ? "Cancel" : "+ Add quote"}
        </Button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <AddQuoteForm
            weddingId={weddingId}
            onAdded={handleAdded}
            onCancel={() => setShowForm(false)}
          />
        )}
      </AnimatePresence>

      {/* Loading state */}
      {loading && (
        <div className="space-y-6 animate-pulse">
          {[2, 1].map((cols, pi) => (
            <div key={pi}>
              <div className="h-3 w-28 bg-secondary rounded mb-4" />
              <div className={`grid gap-4 sm:grid-cols-${cols}`}>
                {Array.from({ length: cols }).map((_, i) => (
                  <div key={i} className="bg-card rounded-xl border border-border p-5 space-y-3 h-32" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && quotes.length === 0 && !showForm && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 rounded-2xl border border-dashed border-border"
        >
          <p className="text-4xl mb-4">💌</p>
          <p className="text-lg font-serif text-primary mb-2">No quotes yet</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
            Paste a vendor email or quote and Sam will extract all the line items so you can compare side-by-side.
          </p>
          <Button onClick={() => setShowForm(true)}>Add your first quote →</Button>
        </motion.div>
      )}

      {/* Quotes grouped by category */}
      {!loading && categoriesWithQuotes.length > 0 && (
        <div className="space-y-10">
          {categoriesWithQuotes.map((category) => (
            <CategoryGroup
              key={category}
              category={category}
              quotes={byCategory[category]}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
