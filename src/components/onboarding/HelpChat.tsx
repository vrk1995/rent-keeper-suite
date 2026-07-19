import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, X, ArrowRight, ChevronLeft, PlayCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HELP_FEATURES, type HelpFeature } from "@/lib/helpContent";
import { cn } from "@/lib/utils";

const HelpChat = ({ onRestartTour }: { onRestartTour: () => void }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<HelpFeature | null>(null);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_FEATURES;
    return HELP_FEATURES.filter(
      (f) => f.title.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const g: Record<string, HelpFeature[]> = {};
    filtered.forEach((f) => {
      (g[f.category] ||= []).push(f);
    });
    return g;
  }, [filtered]);

  const takeMeThere = () => {
    if (!active) return;
    navigate(active.route);
    setOpen(false);
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        data-tour="help-launcher"
        aria-label="Open help"
        onClick={() => setOpen(true)}
        className="fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6 h-12 w-12 md:h-14 md:w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center md:justify-end p-0 md:p-6"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 24, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full md:w-[420px] h-[85vh] md:h-[600px] bg-card border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                {active && (
                  <button onClick={() => setActive(null)} aria-label="Back" className="p-1 -ml-1 text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {active ? active.title : "How can we help?"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {active ? active.category : "Pick a feature and we'll guide you"}
                  </p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                {!active && (
                  <div className="p-4 space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search features..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    <button
                      onClick={() => {
                        setOpen(false);
                        onRestartTour();
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 text-left hover:bg-primary/15 transition-colors"
                    >
                      <PlayCircle className="w-5 h-5 text-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Restart the product tour</p>
                        <p className="text-xs text-muted-foreground">Quick 60-second overview of the app</p>
                      </div>
                    </button>

                    {Object.entries(grouped).map(([cat, items]) => (
                      <div key={cat}>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">{cat}</p>
                        <div className="space-y-1">
                          {items.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => setActive(f)}
                              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 flex items-center justify-between group transition-colors"
                            >
                              <span className="text-sm">{f.title}</span>
                              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {filtered.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No matching topics. Try a different search.
                      </p>
                    )}
                  </div>
                )}

                {active && (
                  <div className="p-4 space-y-4">
                    <ol className="space-y-3">
                      {active.steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span
                            className={cn(
                              "flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-semibold flex items-center justify-center"
                            )}
                          >
                            {i + 1}
                          </span>
                          <p className="text-sm leading-relaxed text-foreground/90">{step}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* Footer */}
              {active && (
                <div className="p-4 border-t border-white/10 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setActive(null)}>
                    Back
                  </Button>
                  <Button className="flex-1" onClick={takeMeThere}>
                    Take me there
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default HelpChat;
