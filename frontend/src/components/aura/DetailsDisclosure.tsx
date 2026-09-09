import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

interface DetailsDisclosureProps {
  label?: string;
  children: ReactNode;
}

/** Collapsed-by-default drawer for everything a driver doesn't need mid-drive. */
export function DetailsDisclosure({ label = "Details", children }: DetailsDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`border px-4 py-2 text-[10px] tracking-[0.25em] uppercase transition-colors ${
          open
            ? "border-foreground bg-foreground text-background"
            : "border-border text-muted-foreground hover:border-hud hover:text-hud"
        }`}
      >
        {open ? `▲ Hide ${label}` : `▼ ${label}`}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
